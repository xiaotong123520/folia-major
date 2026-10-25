import UIKit
import AVFoundation
import MediaPlayer
import WebKit

// A real native player for background audio, never a silent keep-alive loop.
final class NativeBackgroundAudio: NSObject, WKScriptMessageHandlerWithReply {
    weak var browser: WKWebView?
    private var sourceID = ""
    private var sourceURL: URL?
    private var transferURL: URL?
    private var transfer: FileHandle?
    private var expected = 0
    private var written = 0
    private var snapshot: [String: Any] = [:]
    private var player: AVPlayer?
    private var observation: NSKeyValueObservation?
    private var observer: Any?
    private var owned = false
    private var background = false
    private var ended = false
    private var started = false
    private var wantsPlay = false
    private var interrupted = false
    private var task: UIBackgroundTaskIdentifier = .invalid
    private var commands: [(MPRemoteCommand, Any)] = []
    private var nextWasEnabled = false
    private var previousWasEnabled = false
    private var artwork: MPMediaItemArtwork?
    private var artworkURL = ""

    override init() {
        super.init()
        if let files = try? FileManager.default.contentsOfDirectory(at: FileManager.default.temporaryDirectory, includingPropertiesForKeys: nil) {
            for url in files where url.lastPathComponent.hasPrefix("tingyu-audio-") { try? FileManager.default.removeItem(at: url) }
        }
        NotificationCenter.default.addObserver(self, selector: #selector(willLeave), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(didReturn), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interruption), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged), name: AVAudioSession.routeChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(finished), name: .AVPlayerItemDidPlayToEndTime, object: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.scheme == "https",
              message.frameInfo.request.url?.host == "folia-major-ai-radio-preview.vercel.app",
              let body = message.body as? [String: Any], let action = body["action"] as? String,
              let id = body["id"] as? String, !id.isEmpty, id.count <= 20 else {
            replyHandler(nil, "Invalid audio message"); return
        }
        do {
            switch action {
            case "source", "begin":
                guard !owned else { replyHandler(nil, "Native audio busy"); return }
                clearSource()
                sourceID = id
                snapshot = body["state"] as? [String: Any] ?? [:]
                if action == "source" {
                    guard let value = body["url"] as? String, value.count < 16384,
                          let url = URL(string: value), url.scheme == "https", url.host != nil,
                          url.user == nil, url.password == nil else { throw AudioError.invalid }
                    sourceURL = url
                } else {
                    guard let size = body["size"] as? Int, size > 0, size <= 64 * 1024 * 1024 else { throw AudioError.invalid }
                    expected = size
                    let mime = body["mime"] as? String ?? ""
                    let ext = mime.contains("mp4") ? "m4a" : mime.contains("aac") ? "aac" : mime.contains("flac") ? "flac" : mime.contains("ogg") ? "ogg" : mime.contains("wav") ? "wav" : "mp3"
                    let url = FileManager.default.temporaryDirectory.appendingPathComponent("tingyu-audio-\(UUID().uuidString).\(ext)")
                    FileManager.default.createFile(atPath: url.path, contents: nil)
                    transferURL = url
                    transfer = try FileHandle(forWritingTo: url)
                    if let fallback = body["fallback"] as? String, fallback.count < 16384,
                       let remote = URL(string: fallback), remote.scheme == "https", remote.host != nil,
                       remote.user == nil, remote.password == nil { sourceURL = remote }
                }
            case "chunk":
                guard id == sourceID, let file = transfer, let offset = body["offset"] as? Int, offset == written,
                      let text = body["data"] as? String, text.count <= 90000,
                      let data = Data(base64Encoded: text), !data.isEmpty, data.count <= 65536,
                      written + data.count <= expected else { throw AudioError.invalid }
                try file.write(contentsOf: data); written += data.count
            case "finish":
                guard id == sourceID, written == expected, expected > 0, let url = transferURL else { throw AudioError.invalid }
                try transfer?.close(); transfer = nil; sourceURL = url
                if owned && !started {
                    observation = nil; player?.pause()
                    if let observer = observer { player?.removeTimeObserver(observer) }; observer = nil
                    player = nil; owned = false
                    releaseCommands()
                    startBackground()
                }
            case "state":
                guard id == sourceID, !owned, !background else { replyHandler(["ready": sourceURL != nil], nil); return }
                snapshot = body
                prepareArtwork()
            case "handoff":
                guard background, id == sourceID, sourceURL != nil, body["playing"] as? Bool == true else {
                    replyHandler(["ready": false], nil); return
                }
                snapshot = body
                prepareArtwork()
                startBackground()
            default: throw AudioError.invalid
            }
            replyHandler(["ready": sourceURL != nil], nil)
        } catch { replyHandler(nil, "Audio preparation unavailable") }
    }

    private enum AudioError: Error { case invalid }
    private func clearSource() {
        try? transfer?.close(); transfer = nil
        if let url = transferURL { try? FileManager.default.removeItem(at: url) }
        transferURL = nil; sourceURL = nil; expected = 0; written = 0
    }
    func reset() {
        owned = false; background = false; wantsPlay = false; observation = nil
        player?.pause()
        if let observer = observer { player?.removeTimeObserver(observer) }; observer = nil
        player = nil
        releaseCommands()
        clearSource(); snapshot = [:]; sourceID = ""; endTask()
    }
    @objc private func willLeave() {
        background = true
        if task == .invalid { task = UIApplication.shared.beginBackgroundTask { [weak self] in self?.endTask() } }
        browser?.evaluateJavaScript("window.__tingyuNativeAudio?.handoff()") { [weak self] value, _ in
            if value as? Bool != true, self?.snapshot["playing"] as? Bool != true { self?.endTask() }
        }
        // WebKit can suspend its graph before the page handles willResignActive. The last foreground
        // snapshot is still the listener's intent; a system-generated page pause must not erase it.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            guard let self = self, self.background, !self.owned, self.snapshot["playing"] as? Bool == true else { return }
            self.startBackground()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in self?.endTask() }
    }
    private func endTask() {
        if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid }
    }
    private func startBackground() {
        guard background, let url = sourceURL, !owned, !interrupted else { return }
        owned = true; ended = false; started = false; wantsPlay = true
        let token = sourceID
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 15
        let engine = AVPlayer(playerItem: item)
        engine.automaticallyWaitsToMinimizeStalling = true
        engine.volume = Float(max(0, min(1, snapshot["volume"] as? Double ?? 1)))
        player = engine
        observation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self = self, self.owned, self.background, self.sourceID == token, self.player === engine else { return }
                if item.status == .failed { self.didReturn(); return }
                guard item.status == .readyToPlay else { return }
                self.observation = nil
                let time = max(0, self.snapshot["time"] as? Double ?? 0)
                engine.seek(to: CMTime(seconds: time, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                    DispatchQueue.main.async {
                        guard let self = self, self.owned, self.background, self.sourceID == token, self.player === engine else { return }
                        try? AVAudioSession.sharedInstance().setActive(true)
                        self.started = true
                        engine.playImmediately(atRate: Float(max(0.25, min(4, self.snapshot["rate"] as? Double ?? 1))))
                        self.script("hold", token)
                        self.publish(); self.endTask()
                    }
                }
            }
        }
        observer = engine.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 600), queue: .main) { [weak self] _ in self?.publish() }
        installCommands()
    }

    @objc private func didReturn() {
        background = false
        guard owned, let engine = player else { endTask(); return }
        let time = engine.currentTime().seconds
        let state: [String: Any] = ["id": sourceID, "time": started && time.isFinite ? time : (snapshot["time"] as? Double ?? 0), "playing": wantsPlay && !ended && !interrupted, "ended": ended]
        owned = false; engine.pause(); observation = nil
        if let observer = observer { engine.removeTimeObserver(observer) }; observer = nil
        player = nil
        releaseCommands()
        script("restore", state); endTask()
    }
    private func script(_ method: String, _ value: Any) {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
              let json = String(data: data, encoding: .utf8) else { return }
        browser?.evaluateJavaScript("window.__tingyuNativeAudio?.\(method)(\(json))", completionHandler: nil)
    }
    private func publish() {
        guard owned, let engine = player else { return }
        var info: [String: Any] = [MPMediaItemPropertyTitle: snapshot["title"] as? String ?? "听屿 FM",
            MPMediaItemPropertyArtist: snapshot["artist"] as? String ?? "", MPMediaItemPropertyAlbumTitle: snapshot["album"] as? String ?? "",
            MPNowPlayingInfoPropertyPlaybackRate: engine.rate]
        let time = engine.currentTime().seconds
        if time.isFinite { info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = time }
        if let duration = engine.currentItem?.duration.seconds, duration.isFinite { info[MPMediaItemPropertyPlaybackDuration] = duration }
        if let artwork = artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
    private func prepareArtwork() {
        let value = snapshot["artwork"] as? String ?? ""
        guard value != artworkURL else { return }
        artworkURL = value; artwork = nil
        guard let url = URL(string: value), url.scheme == "https", url.user == nil, url.password == nil else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, response, _ in
            guard let data = data, data.count <= 4 * 1024 * 1024,
                  (response as? HTTPURLResponse)?.statusCode == 200, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                guard let self = self, self.artworkURL == value else { return }
                self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }; self.publish()
            }
        }.resume()
    }
    private func installCommands() {
        let center = MPRemoteCommandCenter.shared()
        nextWasEnabled = center.nextTrackCommand.isEnabled
        previousWasEnabled = center.previousTrackCommand.isEnabled
        center.nextTrackCommand.isEnabled = false
        center.previousTrackCommand.isEnabled = false
        let play = center.playCommand.addTarget { [weak self] _ in
            guard let self = self, self.owned, !self.interrupted else { return .commandFailed }
            self.wantsPlay = true; try? AVAudioSession.sharedInstance().setActive(true); self.player?.play(); self.publish(); return .success
        }
        let pause = center.pauseCommand.addTarget { [weak self] _ in
            guard let self = self, self.owned else { return .commandFailed }
            self.wantsPlay = false; self.player?.pause(); self.publish(); return .success
        }
        let seek = center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self = self, self.owned, let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self.player?.seek(to: CMTime(seconds: max(0, event.positionTime), preferredTimescale: 600)); return .success
        }
        commands = [(center.playCommand, play), (center.pauseCommand, pause), (center.changePlaybackPositionCommand, seek)]
    }
    private func releaseCommands() {
        guard !commands.isEmpty else { return }
        for (command, target) in commands { command.removeTarget(target) }; commands = []
        let center = MPRemoteCommandCenter.shared()
        center.nextTrackCommand.isEnabled = nextWasEnabled
        center.previousTrackCommand.isEnabled = previousWasEnabled
    }
    @objc private func finished(_ notification: Notification) {
        guard owned, let item = notification.object as? AVPlayerItem, item === player?.currentItem else { return }
        if snapshot["loop"] as? Bool == true, wantsPlay {
            player?.seek(to: .zero); player?.play(); return
        }
        ended = true; wantsPlay = false; publish()
    }
    @objc private func interruption(_ notification: Notification) {
        guard let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: value) else { return }
        interrupted = type == .began
        if interrupted { if owned { player?.pause() } }
        else {
            let options = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume)
            if !shouldResume { wantsPlay = false }
            if owned && wantsPlay && shouldResume { try? AVAudioSession.sharedInstance().setActive(true); player?.play() }
        }
    }
    @objc private func routeChanged(_ notification: Notification) {
        guard owned, let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }
        wantsPlay = false; player?.pause(); publish()
    }
    deinit {
        NotificationCenter.default.removeObserver(self)
        clearSource()
    }
}

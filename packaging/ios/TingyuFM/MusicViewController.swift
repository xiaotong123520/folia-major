import UIKit
import WebKit
import AVFoundation

// 使用持久化 WebKit 数据，避免嵌入本地页面后改变 API 与会话的来源。
final class MusicViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private let startURL = URL(string: "https://folia-major-ai-radio-preview.vercel.app/")!
    private var browser: WKWebView!
    private let failure = UIStackView()
    private let nativeAudio = NativeBackgroundAudio()
    private var updateNotice: AppUpdateNotice?
    private var firstWelcome = !UserDefaults.standard.bool(forKey: "tingyu.notice.happy-listening.v1")

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsAirPlayForMediaPlayback = true
        // 歌曲地址经异步接口返回后仍允许播放，避免失去点击手势导致 NotAllowedError。
        // 不主动播放任何歌曲，播放选择仍由网页播放器处理。
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configureAudioSession()
        configuration.userContentController.addScriptMessageHandler(nativeAudio, contentWorld: .page, name: "tingyuNativeAudio")
        if let scriptURL = Bundle.main.url(forResource: "NativeAudioBridge", withExtension: "js"),
           let script = try? String(contentsOf: scriptURL, encoding: .utf8) {
            configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        configuration.userContentController.add(self, name: "tingyuPlayback")
        let playbackEvents = """
        document.addEventListener('play', function(event) {
            if (event.target instanceof HTMLMediaElement) {
                window.webkit.messageHandlers.tingyuPlayback.postMessage('play');
            }
        }, true);
        """
        configuration.userContentController.addUserScript(WKUserScript(
            source: playbackEvents, injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
        browser = WKWebView(frame: .zero, configuration: configuration)
        nativeAudio.browser = browser
        browser.navigationDelegate = self
        browser.uiDelegate = self
        browser.isOpaque = false
        browser.backgroundColor = .black
        browser.scrollView.backgroundColor = .black
        browser.allowsBackForwardNavigationGestures = true
        browser.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(browser)
        NSLayoutConstraint.activate([
            browser.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            browser.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            browser.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor)
        ])
        failure.axis = .vertical
        failure.alignment = .center
        failure.spacing = 16
        failure.translatesAutoresizingMaskIntoConstraints = false
        let message = UILabel()
        message.text = "暂时无法打开听屿 FM，请检查网络后重试。"
        message.textColor = .white
        message.numberOfLines = 0
        message.textAlignment = .center
        let retry = UIButton(type: .system)
        retry.setTitle("重新打开", for: .normal)
        retry.addTarget(self, action: #selector(retryLoading), for: .touchUpInside)
        failure.addArrangedSubview(message)
        failure.addArrangedSubview(retry)
        view.addSubview(failure)
        NSLayoutConstraint.activate([
            failure.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            failure.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            failure.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -48)
        ])
        failure.isHidden = true
        retryLoading()
        fetchUpdateNotice()
    }

    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        } catch {
            NSLog("[TingyuAudio] Audio session category failed: %@", error.localizedDescription)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // 仅接受主页面的固定播放事件，不接收 Cookie、音源地址或账户信息。
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.host == startURL.host,
              message.body as? String == "play" else { return }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            NSLog("[TingyuAudio] Audio session activation failed: %@", error.localizedDescription)
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        let noticeKey = "tingyu.notice.happy-listening.v1"
        guard !UserDefaults.standard.bool(forKey: noticeKey),
              presentedViewController == nil else { showUpdateIfNeeded(); return }
        let notice = UIAlertController(
            title: "听屿 FM 公告",
            message: "天天开心，听歌愉快",
            preferredStyle: .alert
        )
        notice.addAction(UIAlertAction(title: "开始听歌", style: .default) { _ in
            UserDefaults.standard.set(true, forKey: noticeKey)
            // A fresh install keeps the original welcome; release details begin with the next update.
            self.markFirstUpdateSeen()
        })
        present(notice, animated: true)
    }

    private struct AppUpdateNotice: Decodable {
        let id: String
        let version: String
        let changes: [String]
    }
    private func fetchUpdateNotice() {
        let url = startURL.appendingPathComponent("app-updates.json")
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            guard let data = data, data.count <= 32768,
                  (response as? HTTPURLResponse)?.statusCode == 200,
                  let notice = try? JSONDecoder().decode(AppUpdateNotice.self, from: data),
                  !notice.id.isEmpty, notice.id.count <= 100, notice.version.count <= 80,
                  !notice.changes.isEmpty, notice.changes.count <= 12,
                  notice.changes.allSatisfy({ !$0.isEmpty && $0.count <= 500 }) else { return }
            DispatchQueue.main.async {
                self?.updateNotice = notice
                if self?.firstWelcome == true { self?.markFirstUpdateSeen() }
                else { self?.showUpdateIfNeeded() }
            }
        }.resume()
    }
    private func markFirstUpdateSeen() {
        guard firstWelcome, UserDefaults.standard.bool(forKey: "tingyu.notice.happy-listening.v1"),
              let notice = updateNotice else { return }
        UserDefaults.standard.set(notice.id, forKey: "tingyu.notice.last-update.v1")
        firstWelcome = false
    }
    private func showUpdateIfNeeded() {
        guard !firstWelcome, presentedViewController == nil, view.window != nil,
              let notice = updateNotice,
              UserDefaults.standard.string(forKey: "tingyu.notice.last-update.v1") != notice.id else { return }
        let alert = UIAlertController(title: "听屿 FM 更新公告 · \(notice.version)",
            message: notice.changes.map { "• " + $0 }.joined(separator: "\n\n"), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "知道了", style: .default) { _ in
            UserDefaults.standard.set(notice.id, forKey: "tingyu.notice.last-update.v1")
        })
        present(alert, animated: true)
    }

    @objc private func retryLoading() {
        failure.isHidden = true
        browser.isHidden = false
        browser.load(URLRequest(url: startURL))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        failure.isHidden = true
        if webView === browser, webView.url?.host == startURL.host { fetchUpdateNotice() }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if webView === browser { nativeAudio.reset() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showFailure(error)
    }

    private func showFailure(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        browser.isHidden = true
        failure.isHidden = false
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        browser.isHidden = true
        failure.isHidden = false
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "https" || scheme == "about" || scheme == "blob" {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            // 只有用户点击的外部应用链接才交给系统；不绕过 TLS 或 HTTP 安全检查。
            if navigationAction.navigationType == .linkActivated && scheme != "http" && scheme != "file" && scheme != "javascript" {
                UIApplication.shared.open(url, options: [:])
            }
        }
    }

    // 新窗口继续使用同一数据存储，登录完成后用户可关闭返回播放器。
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let popup = WKWebView(frame: .zero, configuration: configuration)
        popup.navigationDelegate = self
        popup.uiDelegate = self
        let controller = UIViewController()
        controller.view = popup
        controller.navigationItem.rightBarButtonItem = UIBarButtonItem(title: "完成", style: .done, target: self, action: #selector(closePopup))
        present(UINavigationController(rootViewController: controller), animated: true)
        return popup
    }

    func webViewDidClose(_ webView: WKWebView) { closePopup() }
    @objc private func closePopup() { presentedViewController?.dismiss(animated: true) }
}

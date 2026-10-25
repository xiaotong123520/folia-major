(() => {
    'use strict';
    // Foreground sound/effects stay in the webpage; native playback owns only the background handoff.
    const channel = window.webkit?.messageHandlers?.tingyuNativeAudio;
    if (!channel || window.location.origin !== 'https://folia-major-ai-radio-preview.vercel.app') return;
    let audio = null;
    let source = '';
    let id = '';
    let serial = 0;
    let ownsNative = false;
    let preparing = null;
    const post = message => Promise.resolve(channel.postMessage(message));
    const snapshot = () => {
        const metadata = navigator.mediaSession?.metadata;
        return { action: 'state', id, time: Number.isFinite(audio?.currentTime) ? audio.currentTime : 0,
            playing: !!audio && !audio.paused && !audio.ended, rate: audio?.playbackRate || 1,
            loop: !!audio?.loop,
            volume: audio?.muted ? 0 : audio?.volume ?? 1,
            title: metadata?.title || '听屿 FM', artist: metadata?.artist || '', album: metadata?.album || '',
            artwork: metadata?.artwork?.find(item => item.src?.startsWith('https://'))?.src || '' };
    };
    const encode = blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
    async function prepare(element) {
        const src = element.currentSrc || element.src;
        if (!src || src === source) return preparing;
        source = src; id = String(++serial);
        const token = id;
        preparing = (async () => {
            if (src.startsWith('https://')) {
                await post({ action: 'source', id: token, url: src, state: snapshot() });
            } else if (src.startsWith('blob:')) {
                const response = await fetch(src);
                const blob = await response.blob();
                if (token !== id || blob.size <= 0 || blob.size > 64 * 1024 * 1024) return;
                await post({ action: 'begin', id: token, size: blob.size, mime: blob.type, fallback: element.dataset?.tingyuStreamUrl || '', state: snapshot() });
                for (let offset = 0; offset < blob.size; offset += 65536) {
                    if (token !== id) return;
                    const data = await encode(blob.slice(offset, offset + 65536));
                    await post({ action: 'chunk', id: token, offset, data });
                }
                if (token === id) await post({ action: 'finish', id: token });
            }
            if (token === id && !ownsNative) await post(snapshot());
        })().catch(() => { /* The web player remains usable if native preparation is unavailable. */ });
        return preparing;
    }
    function sync(event) {
        if (ownsNative) return;
        const target = event?.target;
        if (target instanceof HTMLMediaElement && event.type === 'playing') audio = target;
        if (!audio || (target instanceof HTMLMediaElement && target !== audio)) return;
        void prepare(audio);
        if (id) void post(snapshot()).catch(() => {});
    }
    for (const name of ['playing', 'pause', 'seeked', 'ratechange', 'volumechange']) document.addEventListener(name, sync, true);
    setInterval(() => sync(), 1500);
    window.__tingyuNativeAudio = {
        handoff() {
            if (!audio || audio.paused || audio.ended || !id || ownsNative) return false;
            const state = snapshot();
            ownsNative = true;
            void post({ ...state, action: 'handoff' }).then(result => {
                if (result?.ready !== true) ownsNative = false;
            }).catch(() => { ownsNative = false; });
            return true;
        },
        hold(token) {
            if (token === id) { ownsNative = true; audio?.pause(); }
        },
        async restore(state) {
            if (!audio || state.id !== id) { ownsNative = false; return; }
            ownsNative = false;
            if (Number.isFinite(state.time) && state.time >= 0) audio.currentTime = state.time;
            if (state.ended) {
                audio.dispatchEvent(new Event('ended'));
            } else if (state.playing) {
                try {
                    await audio.play();
                    window.dispatchEvent(new Event('tingyu:native-audio-restored'));
                } catch { /* A real user pause/interruption must not become an autoplay loop. */ }
            }
            sync();
        },
    };
})();

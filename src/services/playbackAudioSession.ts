// Keep music in the browser's playback session and repair an interrupted Web Audio graph on return.
type AudioSessionNavigator = { audioSession?: { type: string } };
type RecoverableContext = { state: string; resume(): Promise<void> };
type PlaybackElement = Pick<HTMLAudioElement, 'paused' | 'ended'>;

export function claimPlaybackAudioSession(target?: AudioSessionNavigator): boolean {
    const host = target ?? (typeof navigator === 'undefined' ? undefined : navigator as AudioSessionNavigator);
    if (!host?.audioSession) return false;
    try {
        if (host.audioSession.type !== 'playback') host.audioSession.type = 'playback';
        return true;
    } catch (error) {
        console.warn('[AudioSession] Browser rejected playback session', error);
        return false;
    }
}

export const needsPlaybackContextResume = (context: RecoverableContext): boolean => (
    context.state === 'suspended' || context.state === 'interrupted'
);

export function installPlaybackContextRecovery({ getContext, getAudio, page, view }: {
    getContext: () => RecoverableContext | null;
    getAudio: () => PlaybackElement | null;
    page: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
    view: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}): () => void {
    let pending = false;
    let disposed = false;
    const recover = () => {
        const context = getContext();
        const audio = getAudio();
        // Never press element.play() here: a pause might be the listener's lock-screen command,
        // a phone call, or another app taking over. Only repair a graph whose element still plays.
        if (disposed || pending || page.visibilityState !== 'visible' || !context || !audio
            || audio.paused || audio.ended || !needsPlaybackContextResume(context)) return;
        claimPlaybackAudioSession();
        pending = true;
        void Promise.resolve().then(() => {
            if (disposed || page.visibilityState !== 'visible' || getContext() !== context
                || getAudio() !== audio || audio.paused || audio.ended || !needsPlaybackContextResume(context)) return;
            return context.resume();
        }).catch(error => {
            console.warn('[AudioSession] Could not resume interrupted context', error);
        }).finally(() => { pending = false; });
    };
    page.addEventListener('visibilitychange', recover);
    view.addEventListener('pageshow', recover);
    view.addEventListener('focus', recover);
    view.addEventListener('tingyu:native-audio-restored', recover);
    return () => {
        disposed = true;
        page.removeEventListener('visibilitychange', recover);
        view.removeEventListener('pageshow', recover);
        view.removeEventListener('focus', recover);
        view.removeEventListener('tingyu:native-audio-restored', recover);
    };
}

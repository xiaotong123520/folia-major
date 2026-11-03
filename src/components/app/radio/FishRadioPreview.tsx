import { useEffect, useRef, useState } from 'react';
import { AudioLines, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// On-demand Fish Audio preview. One blob per text; closing or changing text releases all resources.
export default function FishRadioPreview({ text, onPlay, pausePreview }: { text: string; onPlay: () => void; pausePreview: boolean }) {
    const { t } = useTranslation();
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const request = useRef<AbortController | null>(null);
    const audio = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        setUrl(''); setError(''); setBusy(false);
        return () => { request.current?.abort(); audio.current?.pause(); };
    }, [text]);
    useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
    useEffect(() => { if (pausePreview) audio.current?.pause(); }, [pausePreview]);
    const generate = async () => {
        if (busy) return;
        const controller = new AbortController(); request.current = controller;
        setBusy(true); setError('');
        try {
            const endpoint = String(import.meta.env.VITE_RADIO_SPEECH_API_URL || '/api/radio-speech');
            const response = await fetch(endpoint, { method: 'POST', signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (!controller.signal.aborted) setError(t(body.code === 'FISH_NOT_CONFIGURED'
                    ? 'radioAgent.fishNotConfigured' : body.code === 'FISH_FREE_UNAVAILABLE'
                        ? 'radioAgent.fishFreeUnavailable' : 'radioAgent.fishFailed'));
                return;
            }
            if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Invalid audio');
            const blob = await response.blob();
            if (!blob.size || blob.size > 3 * 1024 * 1024) throw new Error('Invalid audio size');
            if (!controller.signal.aborted) setUrl(URL.createObjectURL(blob));
        } catch {
            if (!controller.signal.aborted) setError(t('radioAgent.fishFailed'));
        } finally { if (!controller.signal.aborted) setBusy(false); }
    };
    return <div className="mt-4 space-y-2 rounded-xl border border-violet-200/15 p-3">
        <p className="text-xs text-violet-100">{t('radioAgent.fishTitle')}</p>
        {!url && <button type="button" disabled={busy} onClick={() => void generate()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs text-white disabled:opacity-50">
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <AudioLines size={15} />}
            {t(busy ? 'radioAgent.fishGenerating' : 'radioAgent.fishGenerate')}
        </button>}
        {url && <audio ref={audio} src={url} controls preload="metadata" onPlay={onPlay}
            aria-label={t('radioAgent.fishTitle')} className="w-full" />}
        <p className="text-xs leading-5 text-white/50">{t('radioAgent.fishHint')}</p>
        {error && <p role="alert" className="text-xs leading-5 text-amber-100">{error}</p>}
    </div>;
}

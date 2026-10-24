import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedSong } from '../../../types';
import { omni } from '../../../services/onlineMusic/omni';
import { usePlaybackStore } from '../../../stores/usePlaybackStore';

// On-demand transcript diagnostics and escaped shownotes; text is never rendered as upstream HTML.
export default function PodcastTranscript({ song }: { song: UnifiedSong }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [lines, setLines] = useState<string[]>([]);
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [follow, setFollow] = useState(true);
    const reader = useRef<HTMLDivElement>(null);
    const activeParagraph = useRef<HTMLParagraphElement>(null);
    const activeLine = usePlaybackStore(state => state.currentSong?.id === song.id
        && state.currentSong?.sourceRef?.kind === 'online'
        && state.currentSong.sourceRef.providerId === 'xiaoyuzhou' ? state.currentLineIndex : -1);
    useEffect(() => {
        if (!open || !follow || activeLine < 0) return;
        const box = reader.current;
        const paragraph = activeParagraph.current;
        if (box && paragraph) box.scrollTo({ top: Math.max(0, paragraph.offsetTop - box.clientHeight / 3), behavior: 'smooth' });
    }, [activeLine, follow, open, lines]);
    const load = async () => {
        if (open) { setOpen(false); return; }
        setOpen(true); setBusy(true); setError(''); setLines([]);
        const [detail, text] = await Promise.allSettled([
            omni.getSongDetail('xiaoyuzhou', song.id), omni.getLyrics(song),
        ]);
        if (detail.status === 'fulfilled') {
            const ref = detail.value?.sourceRef;
            setDescription(ref?.kind === 'online' ? String(ref.providerData?.description || '') : '');
        }
        if (text.status === 'fulfilled') setLines(text.value.lyrics?.lines.filter(line => line.fullText.trim()).map(line => line.fullText) || []);
        else setError(text.reason instanceof Error ? text.reason.message : t('podcast.failed'));
        setBusy(false);
    };
    return <div>
        <button type="button" disabled={busy} aria-expanded={open} onClick={() => void load()}
            className="min-h-11 rounded-lg px-3 text-sm underline disabled:opacity-50">{t('podcast.transcript')}</button>
        {open && <>
        {lines.length > 0 && <button type="button" aria-pressed={follow} onClick={() => setFollow(value => !value)}
            className="min-h-11 rounded-lg px-3 text-sm">{t('podcast.followPlayback')}</button>}
        <div ref={reader} className="relative max-h-[min(30dvh,280px)] space-y-3 overflow-y-auto overscroll-contain rounded-xl border border-[var(--st-line)] p-3 text-base leading-8">
            {busy ? <p role="status">{t('podcast.loading')}</p> : <>
                {error && <p role="alert">{error}</p>}
                {lines.length ? <><p className="font-medium">{t('podcast.transcriptAvailable', { count: lines.length })}</p>{lines.map((line, index) => <p key={index}
                    ref={index === activeLine ? activeParagraph : undefined} aria-current={index === activeLine ? 'true' : undefined}
                    className={`rounded-lg border-l-4 px-3 py-2 break-words whitespace-pre-wrap ${index === activeLine ? 'border-violet-400 bg-violet-500/15 text-[var(--st-t1)]' : 'border-transparent text-[var(--st-t2)]'}`}>{line}</p>)}</>
                    : !error && <p>{t('podcast.noTranscript')}</p>}
                {description && <><h3 className="font-medium">{t('podcast.notes')}</h3><p className="whitespace-pre-wrap">{description}</p></>}
            </>}
        </div></>}
    </div>;
}

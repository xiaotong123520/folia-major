import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedSong } from '../../../types';
import { omni } from '../../../services/onlineMusic/omni';

// On-demand transcript diagnostics and escaped shownotes; text is never rendered as upstream HTML.
export default function PodcastTranscript({ song }: { song: UnifiedSong }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [lines, setLines] = useState<string[]>([]);
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
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
        {open && <div className="max-h-[44dvh] space-y-3 overflow-y-auto rounded-xl border border-[var(--st-line)] p-3 text-sm leading-7">
            {busy ? <p role="status">{t('podcast.loading')}</p> : <>
                {error && <p role="alert">{error}</p>}
                {lines.length ? <><p className="font-medium">{t('podcast.transcriptAvailable', { count: lines.length })}</p>{lines.map((line, index) => <p key={index}>{line}</p>)}</>
                    : !error && <p>{t('podcast.noTranscript')}</p>}
                {description && <><h3 className="font-medium">{t('podcast.notes')}</h3><p className="whitespace-pre-wrap">{description}</p></>}
            </>}
        </div>}
    </div>;
}

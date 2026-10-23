import { useEffect, useState } from 'react';
import { Play, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UnifiedSong } from '../../../types';
import { omni } from '../../../services/onlineMusic/omni';

// Both viewport sizes use Omni songs and the app's original cover, lyrics and playback controls.
export default function HearttraceLibrary({ onPlaySong }: {
    onPlaySong: (song: UnifiedSong) => void;
}) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(30);
    const [songs, setSongs] = useState<UnifiedSong[]>([]);
    const [total, setTotal] = useState(0);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        setBusy(true);
        setError('');
        void omni.searchProviderSongs('hearttrace', query, { limit, offset: 0 }).then(page => {
            if (active) { setSongs(page.items); setTotal(page.total ?? page.items.length); }
        }).catch(() => { if (active) setError(t('hearttraceLibrary.failed')); })
            .finally(() => { if (active) setBusy(false); });
        return () => { active = false; };
    }, [query, limit, t]);
    return <section aria-label={t('hearttraceLibrary.title')} className="space-y-4 text-[var(--st-t1)]">
        <p className="text-sm leading-6 text-[var(--st-t2)]">{t('hearttraceLibrary.description', { count: total })}</p>
        <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--st-line)] px-3">
            <Search size={19} className="shrink-0" aria-hidden="true" />
            <input type="search" value={query} maxLength={120} aria-label={t('hearttraceLibrary.search')}
                placeholder={t('hearttraceLibrary.search')} onChange={event => { setQuery(event.target.value); setLimit(30); }}
                className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:ring-2 focus-visible:ring-current" />
        </label>
        <p role="status" className="text-xs text-[var(--st-t2)]">{busy ? t('hearttraceLibrary.loading') : t('hearttraceLibrary.results', { count: total })}</p>
        {error && <p role="alert">{error}</p>}
        <ul className="space-y-1">
            {songs.map(song => <li key={song.sourceRef?.mediaId}>
                <button type="button" aria-label={t('hearttraceLibrary.playNamed', { name: `${song.name} · ${song.album.name}` })}
                    onClick={() => onPlaySong(song)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[var(--st-line)] focus-visible:outline-2 focus-visible:outline-current">
                    <img src={song.album.coverUrl} alt="" loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{song.name}</span><span className="mt-1 block truncate text-xs text-[var(--st-t2)]">{song.album.name}</span></span>
                    <Play size={19} aria-hidden="true" className="shrink-0" />
                </button>
            </li>)}
        </ul>
        {limit < total && <button type="button" onClick={() => setLimit(value => value + 30)} className="min-h-12 w-full rounded-xl border border-[var(--st-line)] text-sm">{t('hearttraceLibrary.more')}</button>}
    </section>;
}

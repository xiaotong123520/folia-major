import { useState } from 'react';
import { ExternalLink, ListPlus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PointSongImport } from '../../../services/directPointSong';
import { createHearttraceImport, HEARTTRACE_ORIGIN } from './catalog';
import { catalogSnapshot } from './catalogSnapshot';

// Browse the owner's public catalog and enqueue its original audio in the persistent shared player.
export default function HearttraceLibrary({ onAddTrack }: {
    onAddTrack: (track: PointSongImport) => boolean;
}) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(30);
    const [notice, setNotice] = useState('');
    const keyword = query.trim().toLocaleLowerCase();
    const tracks = catalogSnapshot.filter(track =>
        `${track.title} ${track.album}`.toLocaleLowerCase().includes(keyword));
    return <section aria-label={t('hearttraceLibrary.title')} className="space-y-4">
        <div>
            <h1 className="text-2xl font-semibold">{t('hearttraceLibrary.title')}</h1>
            <p className="mt-2 text-sm leading-6 text-white/60">{t('hearttraceLibrary.description', { count: catalogSnapshot.length })}</p>
        </div>
        <label className="flex min-h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3">
            <Search size={19} className="shrink-0 text-white/50" aria-hidden="true" />
            <input type="search" value={query} maxLength={120} aria-label={t('hearttraceLibrary.search')}
                placeholder={t('hearttraceLibrary.search')} onChange={event => { setQuery(event.target.value); setLimit(30); }}
                className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:ring-2 focus-visible:ring-violet-200" />
        </label>
        <p role="status" className="text-xs text-white/55">{t('hearttraceLibrary.results', { count: tracks.length })}</p>
        <ul className="space-y-2">
            {tracks.slice(0, limit).map(track => <li key={`${track.directory}/${track.file}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{track.title}</span><span className="mt-1 block truncate text-xs text-white/50">{track.album}</span></span>
                <button type="button" aria-label={t('hearttraceLibrary.addNamed', { name: `${track.title} · ${track.album}` })}
                    onClick={() => {
                        const request = createHearttraceImport(track);
                        setNotice(request && onAddTrack(request) ? t('hearttraceLibrary.added') : t('hearttraceLibrary.failed'));
                    }}
                    className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-violet-200/15 px-3 text-xs text-violet-100 focus-visible:outline-2 focus-visible:outline-violet-200">
                    <ListPlus size={18} aria-hidden="true" />{t('hearttraceLibrary.add')}
                </button>
            </li>)}
        </ul>
        {notice && <p role="status" className="text-sm text-violet-100">{notice}</p>}
        {limit < tracks.length && <button type="button" onClick={() => setLimit(value => value + 30)} className="min-h-12 w-full rounded-xl border border-white/15 text-sm">{t('hearttraceLibrary.more')}</button>}
        <a href={`${HEARTTRACE_ORIGIN}/music.php`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 text-sm text-violet-200"><ExternalLink size={16} aria-hidden="true" />{t('hearttraceLibrary.original')}</a>
        <p className="text-xs leading-6 text-white/45">{t('hearttraceLibrary.snapshot')}</p>
    </section>;
}

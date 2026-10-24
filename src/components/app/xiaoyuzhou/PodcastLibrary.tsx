import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle, Play, Search, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UnifiedSong } from '../../../types';
import type { OmniCollection } from '../../../types/onlineMusic';
import { omni } from '../../../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { openLoginWindow } from '../../login/loginWindowStore';

// One podcast surface: public listening stays available regardless of account status.
export default function PodcastLibrary({ onPlaySong, onLogin }: { onPlaySong: (song: UnifiedSong) => void; onLogin: () => void }) {
    const { t } = useTranslation();
    const user = useOnlineProviderAccountStore(state => state.accounts.xiaoyuzhou?.user || null);
    const [mode, setMode] = useState<'public' | 'subscriptions'>('public');
    const [collections, setCollections] = useState<OmniCollection[]>([]);
    const [selected, setSelected] = useState<OmniCollection | null>(null);
    const [songs, setSongs] = useState<UnifiedSong[]>([]);
    const [query, setQuery] = useState('');
    const [submitted, setSubmitted] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const revision = useRef(0);
    const login = () => { onLogin(); openLoginWindow('xiaoyuzhou'); };
    useEffect(() => {
        const stamp = ++revision.current;
        setBusy(true); setError(''); setSongs([]); setOffset(0); setHasMore(false);
        const run = async () => {
            if (submitted) {
                const page = await omni.searchProviderSongs('xiaoyuzhou', submitted, { limit: 30, offset: 0 });
                if (revision.current === stamp) { setSongs(page.items); setOffset(page.nextOffset); setHasMore(page.hasMore); }
            } else if (selected) {
                const page = await omni.getCollectionTracks(selected, { limit: 30, offset: 0 });
                if (revision.current === stamp) { setSongs(page.items); setOffset(page.nextOffset); setHasMore(page.hasMore); }
            } else {
                const page = await omni.getProviderCollections('xiaoyuzhou', mode === 'subscriptions' ? user?.id ?? null : null, { limit: 30, offset: 0 });
                if (revision.current === stamp) { setCollections(page.items); setOffset(page.nextOffset); setHasMore(page.hasMore); }
            }
        };
        void run().catch(error => { if (revision.current === stamp) setError(error instanceof Error ? error.message : t('podcast.failed')); })
            .finally(() => { if (revision.current === stamp) setBusy(false); });
        return () => { revision.current += 1; };
    }, [mode, selected, submitted, user?.id, t]);
    const more = async () => {
        const stamp = revision.current;
        setBusy(true); setError('');
        try {
            if (!selected && !submitted) {
                const page = await omni.getProviderCollections('xiaoyuzhou', mode === 'subscriptions' ? user?.id ?? null : null, { limit: 30, offset });
                if (revision.current === stamp) { setCollections(old => [...old, ...page.items]); setOffset(page.nextOffset); setHasMore(page.hasMore); }
            } else {
                const page = selected ? await omni.getCollectionTracks(selected, { limit: 30, offset })
                    : await omni.searchProviderSongs('xiaoyuzhou', submitted, { limit: 30, offset });
                if (revision.current === stamp) { setSongs(old => [...old, ...page.items]); setOffset(page.nextOffset); setHasMore(page.hasMore); }
            }
        } catch (error) { if (revision.current === stamp) setError(error instanceof Error ? error.message : t('podcast.failed')); }
        finally { if (revision.current === stamp) setBusy(false); }
    };
    const reset = (next: 'public' | 'subscriptions') => { setMode(next); setSelected(null); setSubmitted(''); setQuery(''); };
    return <section className="space-y-4 text-[var(--st-t1)]" aria-label={t('podcast.title')}>
        <p className="text-sm leading-6 text-[var(--st-t2)]">{t('podcast.description')}</p>
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => reset('public')} aria-pressed={mode === 'public'} className="min-h-11 rounded-xl border border-[var(--st-line)] px-3">{t('podcast.public')}</button>
            {user && <button type="button" onClick={() => reset('subscriptions')} aria-pressed={mode === 'subscriptions'} className="min-h-11 rounded-xl border border-[var(--st-line)] px-3">{t('podcast.subscriptions')}</button>}
            <button type="button" onClick={login} className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--st-line)] px-3"><UserRound size={17} />{user ? user.nickname : t('podcast.optionalLogin')}</button>
        </div>
        <form onSubmit={event => { event.preventDefault(); if (query.trim()) { setSelected(null); setSubmitted(query.trim()); } }} className="flex gap-2">
            <input value={query} onChange={event => setQuery(event.target.value)} maxLength={512} aria-label={t('podcast.search')} placeholder={t('podcast.search')}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-[var(--st-line)] bg-transparent px-3 text-base" />
            <button type="submit" disabled={busy || !query.trim()} aria-label={t('podcast.open')} className="min-h-12 min-w-12 rounded-xl bg-[var(--st-line)] p-3 disabled:opacity-50"><Search size={20}/></button>
        </form>
        <p className="text-xs leading-5 text-[var(--st-t2)]">{t('podcast.publicHint')}</p>
        {(selected || submitted) && <button type="button" onClick={() => reset(mode)} className="flex min-h-11 items-center gap-2"><ArrowLeft size={17}/>{selected?.name || t('podcast.back')}</button>}
        {error && <p role="alert" className="rounded-xl border border-amber-500/30 p-3 text-sm">{error}</p>}
        {!selected && !submitted ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {collections.map(item => <li key={item.id}><button type="button" onClick={() => setSelected(item)} className="w-full rounded-xl border border-[var(--st-line)] p-3 text-left">
                {item.coverUrl && <img src={item.coverUrl} referrerPolicy="no-referrer" alt="" loading="lazy" className="mb-2 aspect-square w-full rounded-lg object-cover"/>}
                <span className="block text-sm font-medium">{item.name}</span><span className="mt-1 block text-xs text-[var(--st-t2)]">{item.creator?.nickname}</span>
            </button></li>)}
        </ul> : <ul className="space-y-2">{songs.map(song => <li key={song.id}><button type="button" onClick={() => onPlaySong(song)}
            className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-[var(--st-line)] p-3 text-left">
            {song.album.coverUrl && <img src={song.album.coverUrl} referrerPolicy="no-referrer" alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover"/>}
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{song.name}</span><span className="mt-1 block text-xs text-[var(--st-t2)]">{song.album.name} · {Math.round(song.durationMs / 60000)} {t('podcast.minutes')}</span></span><Play size={18} className="shrink-0"/>
        </button></li>)}</ul>}
        {busy && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle size={18} className="animate-spin"/>{t('podcast.loading')}</p>}
        {!busy && !error && (selected || submitted ? songs.length === 0 : collections.length === 0) && <p className="text-sm">{t('podcast.empty')}</p>}
        {hasMore && <button type="button" disabled={busy} onClick={() => void more()} className="min-h-11 rounded-xl border border-[var(--st-line)] px-4 disabled:opacity-50">{t('podcast.more')}</button>}
    </section>;
}

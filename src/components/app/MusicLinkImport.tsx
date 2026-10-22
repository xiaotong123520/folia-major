import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, LoaderCircle, Music2, Play, ExternalLink, X } from 'lucide-react';
import type { UnifiedSong } from '../../types';
import { omni } from '../../services/onlineMusic/omni';
import { resolveMusicLink, type MusicLinkResolution } from '../../services/musicLinkResolver';

// Importing a shared link never starts playback without an explicit user action.
// Existing Omni adapters remain responsible for song identity, access and playable audio.
type Props = {
    onClose: () => void;
    onPlayOnline: (song: UnifiedSong) => void;
};

export default function MusicLinkImport({ onClose, onPlayOnline }: Props) {
    const { t } = useTranslation();
    const [input, setInput] = useState('');
    const [resolution, setResolution] = useState<MusicLinkResolution | null>(null);
    const [song, setSong] = useState<UnifiedSong | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const inspect = () => {
        setResolution(resolveMusicLink(input));
        setSong(null);
        setError('');
    };

    const findTrack = async () => {
        if (!resolution?.resourceId || resolution.kind !== 'track' || resolution.access !== 'existing-provider-adapter') return;
        setLoading(true);
        setError('');
        try {
            const found = await omni.getSongDetail(resolution.platform, resolution.resourceId);
            if (!found) {
                setError(t('musicLink.noSong'));
                return;
            }
            setSong(found);
        } catch (reason) {
            console.error('[MusicLinkImport] song lookup failed:', reason);
            setError(t('musicLink.lookupFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/75 p-0 backdrop-blur-lg sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={t('musicLink.title')}>
            <section className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#14141b] text-white sm:rounded-3xl">
                <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div className="flex items-center gap-3"><Link2 size={19}/><h2 className="text-base font-medium">{t('musicLink.title')}</h2></div>
                    <button type="button" onClick={onClose} aria-label={t('musicLink.close')} className="rounded-full p-2 hover:bg-white/10"><X size={18}/></button>
                </header>
                <div className="space-y-4 overflow-y-auto p-5">
                    <form onSubmit={event => { event.preventDefault(); inspect(); }} className="flex gap-2">
                        <input value={input} onChange={event => setInput(event.target.value)} placeholder={t('musicLink.placeholder')} aria-label={t('musicLink.inputLabel')} className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm outline-none focus:border-violet-300/50" />
                        <button type="submit" disabled={!input.trim()} className="rounded-xl bg-violet-200 px-4 text-sm font-medium text-black disabled:opacity-50">{t('musicLink.inspect')}</button>
                    </form>
                    {resolution && <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                        <p className="text-xs uppercase tracking-wide text-violet-200">{resolution.platform} · {resolution.kind}</p>
                        <p className="text-sm leading-6 text-white/70">{resolution.note}</p>
                        {resolution.resourceId && <p className="break-all text-xs text-white/40">{t('musicLink.resourceId')}: {resolution.resourceId}</p>}
                        {resolution.access === 'existing-provider-adapter' && resolution.kind === 'track' && resolution.resourceId && !song &&
                            <button type="button" onClick={() => void findTrack()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">{loading && <LoaderCircle size={15} className="animate-spin"/>}{t('musicLink.fetchSong')}</button>}
                        {resolution.normalizedUrl && <a href={resolution.normalizedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10"><ExternalLink size={15}/>{t('musicLink.openOriginal')}</a>}
                    </div>}
                    {song && <div className="flex items-center gap-3 rounded-xl border border-emerald-200/20 bg-emerald-200/5 p-3">
                        <Music2 size={19} className="text-emerald-100" />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm">{song.name}</p><p className="truncate text-xs text-white/50">{song.artists?.map(artist => artist.name).join(', ') || t('musicLink.unknownArtist')}</p></div>
                        <button type="button" aria-label={t('musicLink.playExisting')} onClick={() => { onPlayOnline(song); onClose(); }} className="rounded-full border border-white/20 p-2.5 hover:bg-white/10"><Play size={17}/></button>
                    </div>}
                    {error && <p role="alert" className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100">{error}</p>}
                    <p className="text-xs leading-5 text-white/40">{t('musicLink.disclaimer')}</p>
                </div>
            </section>
        </div>
    );
}

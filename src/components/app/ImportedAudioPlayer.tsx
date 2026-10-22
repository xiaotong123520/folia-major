import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Music2, Plus, SkipBack, SkipForward, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    audioDisplayName,
    isPlayableAudioFile,
    validatePlayableUrl,
    type ImportedAudioTrack,
} from '../../services/importedAudio';

/** Persistent browser audio queue. Unlike the import dialog it stays mounted while songs play. */
export interface ImportedAudioPlayerHandle {
    addFiles(files: File[]): number;
    addUrl(input: string): boolean;
}

type Props = {
    onStartPlayback: () => void;
    pauseForMainPlayback: boolean;
    onOpenImport: () => void;
};

const ImportedAudioPlayer = forwardRef<ImportedAudioPlayerHandle, Props>(
    function ImportedAudioPlayer({ onStartPlayback, pauseForMainPlayback, onOpenImport }, ref) {
        const { t } = useTranslation();
        const [tracks, setTracks] = useState<ImportedAudioTrack[]>([]);
        const [selectedId, setSelectedId] = useState<string | null>(null);
        const [error, setError] = useState('');
        const audioRef = useRef<HTMLAudioElement | null>(null);
        const ownedUrlsRef = useRef(new Set<string>());
        const playAfterSelectionRef = useRef(false);

        useEffect(() => () => {
            for (const url of ownedUrlsRef.current) URL.revokeObjectURL(url);
            ownedUrlsRef.current.clear();
        }, []);

        useEffect(() => {
            if (pauseForMainPlayback) audioRef.current?.pause();
        }, [pauseForMainPlayback]);

        useImperativeHandle(ref, () => ({
            addFiles(files) {
                const accepted = files.filter(isPlayableAudioFile);
                if (!accepted.length) return 0;
                const additions = accepted.map(file => {
                    const url = URL.createObjectURL(file);
                    ownedUrlsRef.current.add(url);
                    return {
                        id: crypto.randomUUID(),
                        name: file.name,
                        url,
                        temporary: true,
                    };
                });
                setTracks(current => [...current, ...additions]);
                setSelectedId(current => current ?? additions[0].id);
                setError('');
                return additions.length;
            },
            addUrl(input) {
                const url = validatePlayableUrl(input, window.isSecureContext);
                if (!url) return false;
                const track = {
                    id: crypto.randomUUID(),
                    name: audioDisplayName(url),
                    url,
                    temporary: false,
                };
                setTracks(current => [...current, track]);
                setSelectedId(current => current ?? track.id);
                setError('');
                return true;
            },
        }), []);

        const activeTrack = tracks.find(item => item.id === selectedId) ?? tracks[0] ?? null;
        const activeIndex = tracks.findIndex(item => item.id === activeTrack?.id);

        const switchTo = (id: string, shouldPlay: boolean) => {
            if (id === activeTrack?.id) {
                if (shouldPlay) void audioRef.current?.play().catch(() => setError(t('musicImport.tapPlay')));
                return;
            }
            audioRef.current?.pause();
            playAfterSelectionRef.current = shouldPlay;
            setSelectedId(id);
            setError('');
        };

        useEffect(() => {
            if (!playAfterSelectionRef.current || !activeTrack) return;
            playAfterSelectionRef.current = false;
            void audioRef.current?.play().catch(() => setError(t('musicImport.tapPlay')));
        }, [activeTrack?.id, t]);

        const remove = (id: string) => {
            const removed = tracks.find(item => item.id === id);
            if (!removed) return;
            if (activeTrack?.id === id) audioRef.current?.pause();
            if (removed.temporary) {
                URL.revokeObjectURL(removed.url);
                ownedUrlsRef.current.delete(removed.url);
            }
            setTracks(current => current.filter(track => track.id !== id));
            if (selectedId === id) setSelectedId(tracks.find(item => item.id !== id)?.id ?? null);
            setError('');
        };

        const clear = () => {
            audioRef.current?.pause();
            for (const url of ownedUrlsRef.current) URL.revokeObjectURL(url);
            ownedUrlsRef.current.clear();
            playAfterSelectionRef.current = false;
            setTracks([]);
            setSelectedId(null);
            setError('');
        };

        if (!activeTrack) return null;

        return (
            <section
                aria-label={t('musicImport.queue')}
                className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 right-2 z-[95] max-h-[min(62dvh,27rem)] overflow-y-auto rounded-2xl border border-white/20 bg-[#17151f]/95 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl sm:bottom-5 sm:left-5 sm:right-auto sm:w-96 sm:max-h-[70vh]"
            >
                <div className="flex items-center gap-2">
                    <Music2 size={18} className="shrink-0 text-violet-200" />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{activeTrack.name}</p>
                    <span className="text-xs text-white/50">{activeIndex + 1}/{tracks.length}</span>
                    <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10" title="添加音乐" aria-label="添加音乐" onClick={onOpenImport}><Plus size={19}/></button>
                    <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/65 hover:bg-white/10" title={t('musicImport.clear')} aria-label={t('musicImport.clear')} onClick={clear}>
                        <Trash2 size={16} />
                    </button>
                </div>
                <audio
                    key={activeTrack.id}
                    ref={audioRef}
                    className="mt-2 min-h-12 w-full"
                    controls
                    preload="metadata"
                    src={activeTrack.url}
                    onPlay={() => { setError(''); onStartPlayback(); }}
                    onError={() => setError(t('musicImport.audioError'))}
                    onEnded={() => {
                        if (activeIndex + 1 < tracks.length) switchTo(tracks[activeIndex + 1].id, true);
                    }}
                />
                <div className="mt-1 flex items-center justify-between gap-3">
                    <button type="button" className="flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-30" disabled={activeIndex <= 0} aria-label={t('musicImport.previous')} onClick={() => switchTo(tracks[activeIndex - 1].id, true)}>
                        <SkipBack size={17} />
                    </button>
                    <p className="text-center text-[11px] text-white/50">{t('musicImport.browserPlayback')}</p>
                    <button type="button" className="flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-30" disabled={activeIndex >= tracks.length - 1} aria-label={t('musicImport.next')} onClick={() => switchTo(tracks[activeIndex + 1].id, true)}>
                        <SkipForward size={17} />
                    </button>
                </div>
                {tracks.length > 1 && <div className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-white/10 pt-2">
                    {tracks.map(track => <div className="flex items-center gap-2" key={track.id}>
                        <button
                            type="button"
                            onClick={() => switchTo(track.id, true)}
                            className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs ${track.id === activeTrack.id ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10'}`}
                        >{track.name}</button>
                        <button type="button" aria-label={t('musicImport.remove')} onClick={() => remove(track.id)} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10"><X size={14} /></button>
                    </div>)}
                </div>}
                {error && <p role="alert" className="mt-2 text-xs text-amber-200">{error}</p>}
            </section>
        );
    },
);
export default ImportedAudioPlayer;

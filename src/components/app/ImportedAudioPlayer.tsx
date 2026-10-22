import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Music2, SkipBack, SkipForward, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    audioDisplayName,
    isPlayableAudioFile,
    validatePlayableUrl,
    type ImportedAudioTrack,
} from '../../services/importedAudio';
import { importedAudioDatabase, writeImportedAudio } from '../../services/importedAudioStorage';
import { resolvePointSongMediaUrl, type PointSongImport } from '../../services/directPointSong';

/** Persistent browser audio queue. Unlike the import dialog it stays mounted while songs play. */
export interface ImportedAudioPlayerHandle {
    addFiles(files: File[]): number;
    addUrl(input: string): boolean;
    addPointSong(request: PointSongImport): boolean;
}

type Props = {
    onStartPlayback: () => void;
    pauseForMainPlayback: boolean;
};

const ImportedAudioPlayer = forwardRef<ImportedAudioPlayerHandle, Props>(
    function ImportedAudioPlayer({ onStartPlayback, pauseForMainPlayback }, ref) {
        const { t } = useTranslation();
        const [tracks, setTracks] = useState<ImportedAudioTrack[]>([]);
        const [selectedId, setSelectedId] = useState<string | null>(null);
        const [error, setError] = useState('');
        const [fallbackRetry, setFallbackRetry] = useState<{ id: string; url: string } | null>(null);
        const fallbackAttemptsRef = useRef(new Map<string, number>());
        const resolvingUrlRef = useRef<string | null>(null);
        const playWasStartedRef = useRef(false);
        const audioRef = useRef<HTMLAudioElement | null>(null);
        const ownedUrlsRef = useRef(new Set<string>());
        const playAfterSelectionRef = useRef(false);
        const restoreVersionRef = useRef(0);
        const storageError = () => setError(t('musicImport.storageError'));

        useEffect(() => {
            let cancelled = false;
            const version = restoreVersionRef.current;
            void importedAudioDatabase.tracks.orderBy('createdAt').toArray().then(saved => {
                if (cancelled || version !== restoreVersionRef.current) return;
                const restored = saved.flatMap(item => {
                    if (!item.file && !item.url) return [];
                    const url = item.file ? URL.createObjectURL(item.file) : validatePlayableUrl(item.url ?? '');
                    if (!url) return [];
                    if (item.file) ownedUrlsRef.current.add(url);
                    return [{ id: item.id, name: item.name, url, temporary: Boolean(item.file), fallbackUrls: item.fallbackUrls?.map(value => validatePlayableUrl(value)).filter((value): value is string => Boolean(value)) ?? [] }];
                });
                setTracks(current => [...restored.filter(item => !current.some(track => track.id === item.id)), ...current]);
                setSelectedId(current => current ?? restored[0]?.id ?? null);
            }).catch(() => { if (!cancelled) storageError(); });
            return () => { cancelled = true; };
        }, []);

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
                void writeImportedAudio(() => importedAudioDatabase.tracks.bulkPut(additions.map((track, index) => ({
                    id: track.id, name: track.name, file: accepted[index], createdAt: Date.now() + index,
                })))).catch(storageError);
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
                void writeImportedAudio(() => importedAudioDatabase.tracks.put({
                    id: track.id, name: track.name, url: track.url, createdAt: Date.now(),
                })).catch(storageError);
                return true;
            },
            addPointSong(request) {
                const url = validatePlayableUrl(request.url, window.isSecureContext);
                if (!url || request.name.trim().length === 0) return false;
                const fallbackUrls = request.fallbackUrls
                    .map(candidate => validatePlayableUrl(candidate, window.isSecureContext))
                    .filter((candidate): candidate is string => Boolean(candidate) && candidate !== url)
                    .slice(0, 3);
                const track = {
                    id: crypto.randomUUID(),
                    name: request.name,
                    url,
                    temporary: false,
                    fallbackUrls,
                };
                setTracks(current => [...current, track]);
                setSelectedId(current => current ?? track.id);
                setError('');
                void writeImportedAudio(() => importedAudioDatabase.tracks.put({
                    id: track.id, name: track.name, url: track.url,
                    fallbackUrls: track.fallbackUrls, createdAt: Date.now(),
                })).catch(storageError);
                return true;
            },
        }), [t]);

        const activeTrack = tracks.find(item => item.id === selectedId) ?? tracks[0] ?? null;
        const activeIndex = tracks.findIndex(item => item.id === activeTrack?.id);

        const switchTo = (id: string, shouldPlay: boolean) => {
            if (id === activeTrack?.id) {
                if (shouldPlay) void audioRef.current?.play().catch(() => setError(t('musicImport.tapPlay')));
                return;
            }
            audioRef.current?.pause();
            playWasStartedRef.current = false;
            setFallbackRetry(null);
            playAfterSelectionRef.current = shouldPlay;
            setSelectedId(id);
            setError('');
        };

        useEffect(() => {
            if (!playAfterSelectionRef.current || !activeTrack) return;
            playAfterSelectionRef.current = false;
            void audioRef.current?.play().catch(() => setError(t('musicImport.tapPlay')));
        }, [activeTrack?.id, fallbackRetry?.url, t]);

        const remove = (id: string) => {
            restoreVersionRef.current += 1;
            const removed = tracks.find(item => item.id === id);
            if (!removed) return;
            if (activeTrack?.id === id) {
                audioRef.current?.pause();
                setFallbackRetry(null);
                playWasStartedRef.current = false;
            }
            fallbackAttemptsRef.current.delete(id);
            if (removed.temporary) {
                URL.revokeObjectURL(removed.url);
                ownedUrlsRef.current.delete(removed.url);
            }
            setTracks(current => current.filter(track => track.id !== id));
            if (selectedId === id) setSelectedId(tracks.find(item => item.id !== id)?.id ?? null);
            setError('');
            void writeImportedAudio(() => importedAudioDatabase.tracks.delete(id)).catch(storageError);
        };

        const clear = () => {
            restoreVersionRef.current += 1;
            audioRef.current?.pause();
            for (const url of ownedUrlsRef.current) URL.revokeObjectURL(url);
            ownedUrlsRef.current.clear();
            playAfterSelectionRef.current = false;
            playWasStartedRef.current = false;
            fallbackAttemptsRef.current.clear();
            setFallbackRetry(null);
            setTracks([]);
            setSelectedId(null);
            setError('');
            void writeImportedAudio(() => importedAudioDatabase.tracks.clear()).catch(storageError);
        };

        if (!activeTrack) return null;

        return (
            <section
                aria-label={t('musicImport.queue')}
                className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))] z-[95] max-h-[70dvh] w-[calc(100%-1.5rem)] max-w-sm overflow-y-auto rounded-2xl border border-white/20 bg-[#17151f]/95 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl sm:bottom-5 sm:left-5"
            >
                <div className="flex items-center gap-2">
                    <Music2 size={18} className="shrink-0 text-violet-200" />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{activeTrack.name}</p>
                    <span className="text-xs text-white/50">{activeIndex + 1}/{tracks.length}</span>
                    <button type="button" className="rounded-lg p-2 text-white/65 hover:bg-white/10" title={t('musicImport.clear')} aria-label={t('musicImport.clear')} onClick={clear}>
                        <Trash2 size={16} />
                    </button>
                </div>
                <audio
                    key={activeTrack.id}
                    ref={audioRef}
                    className="mt-2 w-full"
                    controls
                    preload="metadata"
                    src={fallbackRetry?.id === activeTrack.id ? fallbackRetry.url : activeTrack.url}
                    onPlay={() => { playWasStartedRef.current = true; setError(''); onStartPlayback(); }}
                    onPause={() => { if (!audioRef.current?.error) playWasStartedRef.current = false; }}
                    onError={() => {
                        const failedUrl = fallbackRetry?.id === activeTrack.id ? fallbackRetry.url : activeTrack.url;
                        const tryFallback = () => {
                            const attempt = fallbackAttemptsRef.current.get(activeTrack.id) ?? 0;
                            const candidate = activeTrack.fallbackUrls?.[attempt];
                            if (candidate) {
                                fallbackAttemptsRef.current.set(activeTrack.id, attempt + 1);
                                playAfterSelectionRef.current = playWasStartedRef.current;
                                setFallbackRetry({ id: activeTrack.id, url: candidate });
                                setError('当前接口无法播放，正在尝试 QQ 备用接口');
                            } else {
                                playWasStartedRef.current = false;
                                setError(t('musicImport.audioError') + '；接口可能返回 JSON、禁止跨域读取或无播放权限');
                            }
                        };
                        // Some endpoints respond with a JSON {data:{url}}. This is only readable if
                        // the vendor explicitly allows browser CORS; never attempt to evade that policy.
                        if (resolvingUrlRef.current === failedUrl) return;
                        resolvingUrlRef.current = failedUrl;
                        void resolvePointSongMediaUrl(failedUrl).then(url => {
                            resolvingUrlRef.current = null;
                            if (audioRef.current?.src !== failedUrl) return;
                            if (url && url !== failedUrl) {
                                playAfterSelectionRef.current = playWasStartedRef.current;
                                setFallbackRetry({ id: activeTrack.id, url });
                                setError('已读取点歌接口返回的音频地址，尝试播放');
                                return;
                            }
                            tryFallback();
                        });
                    }}
                    onEnded={() => {
                        if (activeIndex + 1 < tracks.length) switchTo(tracks[activeIndex + 1].id, true);
                    }}
                />
                <div className="mt-1 flex items-center justify-between gap-3">
                    <button type="button" className="rounded-lg p-2 disabled:opacity-30" disabled={activeIndex <= 0} aria-label={t('musicImport.previous')} onClick={() => switchTo(tracks[activeIndex - 1].id, true)}>
                        <SkipBack size={17} />
                    </button>
                    <p className="text-center text-[11px] text-white/50">{t('musicImport.browserPlayback')}</p>
                    <button type="button" className="rounded-lg p-2 disabled:opacity-30" disabled={activeIndex >= tracks.length - 1} aria-label={t('musicImport.next')} onClick={() => switchTo(tracks[activeIndex + 1].id, true)}>
                        <SkipForward size={17} />
                    </button>
                </div>
                {tracks.length > 1 && <div className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t border-white/10 pt-2">
                    {tracks.map(track => <div className="flex items-center gap-2" key={track.id}>
                        <button
                            type="button"
                            onClick={() => switchTo(track.id, true)}
                            className={`min-h-11 min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs ${track.id === activeTrack.id ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10'}`}
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

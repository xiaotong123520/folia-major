import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, AudioLines, Bot, Check, LoaderCircle, Mic, Music2, Pause, Play, Radio, Send, Settings2, Volume2, VolumeX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LocalSong, UnifiedSong } from '../../types';
import { omni } from '../../services/onlineMusic/omni';
import { getNavidromeConfig, isNavidromeEnabled, navidromeApi } from '../../services/navidromeService';
import { buildUnifiedNavidromeSong } from '../../services/playbackAdapters';

// src/components/app/RadioAgent.tsx — mood-based radio creation, search, and playback handoff.
type RadioBrief = {
    title: string;
    mood: string;
    genres: string[];
    searchTerms: string[];
    energy: 'low' | 'medium' | 'high';
    narration?: string;
};

type Props = {
    open: boolean;
    onClose: () => void;
    localSongs: LocalSong[];
    onPlayOnline: (song: UnifiedSong) => void;
    onPlayLocal: (song: LocalSong) => void;
};

type SpeechRecognitionResultLike = { 0?: { transcript?: string } };
type SpeechRecognitionLike = {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: { results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
    onerror: ((event: { error?: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
};
type SpeechWindow = Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const makeFallbackBrief = (message: string): RadioBrief => {
    const cleaned = message.trim();
    const mood = /雨|雨天|rain|storm/i.test(cleaned) ? '雨夜氛围'
        : /难过|失落|伤心|sad|lonely|失恋/i.test(cleaned) ? '温柔疗愈'
        : /开心|快乐|兴奋|happy|energy/i.test(cleaned) ? '轻快明亮'
        : /专注|工作|学习|focus|work/i.test(cleaned) ? '安静专注'
        : '深夜陪伴';
    const genres = /民谣|folk/i.test(cleaned) ? ['民谣', '独立民谣']
        : /爵士|jazz/i.test(cleaned) ? ['爵士', '轻音乐']
        : /古典|classical|钢琴|piano/i.test(cleaned) ? ['钢琴', '古典']
        : /摇滚|rock/i.test(cleaned) ? ['独立摇滚', '另类']
        : ['独立音乐', '民谣', '氛围音乐'];
    const searchTerms = [...new Set([cleaned, ...genres])].filter(Boolean).slice(0, 4);
    return { title: mood + '电台', mood, genres, searchTerms, energy: /开心|快乐|兴奋|happy|rock/i.test(cleaned) ? 'medium' : 'low' };
};

const isBrief = (value: unknown): value is RadioBrief => {
    if (!value || typeof value !== 'object') return false;
    const brief = value as Partial<RadioBrief>;
    return typeof brief.title === 'string'
        && typeof brief.mood === 'string'
        && Array.isArray(brief.genres) && brief.genres.every(item => typeof item === 'string')
        && Array.isArray(brief.searchTerms) && brief.searchTerms.every(item => typeof item === 'string')
        && ['low', 'medium', 'high'].includes(String(brief.energy));
};

const localLabel = (song: LocalSong) => song.title || song.fileName.replace(/\.[^.]+$/, '');
const localArtist = (song: LocalSong, fallback: string) => song.onlineMetadata?.artists?.map((artist) => typeof artist === 'string' ? artist : artist.name).filter(Boolean).join(', ') || song.importedMetadata?.artistNames?.join(', ') || fallback;

export default function RadioAgent({ open, onClose, localSongs, onPlayOnline, onPlayLocal }: Props) {
    const { t } = useTranslation();
    const [message, setMessage] = useState('');
    const [brief, setBrief] = useState<RadioBrief | null>(null);
    const [onlineSongs, setOnlineSongs] = useState<UnifiedSong[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [narrationEnabled, setNarrationEnabled] = useState(false);
    const [voiceListening, setVoiceListening] = useState(false);
    const [voiceSupported, setVoiceSupported] = useState(false);
    const [playingIntro, setPlayingIntro] = useState(false);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const localMatches = useMemo(() => {
        if (!brief) return [];
        const words = [brief.mood, ...brief.genres, ...brief.searchTerms].join(' ').toLocaleLowerCase();
        const tokens = words.split(/[\s,，。!！?？、]+/).filter(token => token.length > 1);
        return localSongs.filter(song => {
            const haystack = [song.title, song.fileName, song.folderName, localArtist(song, t('radioAgent.localLibraryFallback'))].join(' ').toLocaleLowerCase();
            return tokens.some(token => haystack.includes(token));
        }).slice(0, 8);
    }, [brief, localSongs, t]);

    useEffect(() => {
        const speechWindow = window as SpeechWindow;
        setVoiceSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
        return () => {
            recognitionRef.current?.stop();
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        };
    }, []);

    useEffect(() => {
        if (!open) {
            recognitionRef.current?.stop();
            setVoiceListening(false);
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            setPlayingIntro(false);
        }
    }, [open]);

    const createStation = useCallback(async (rawMessage: string) => {
        const prompt = rawMessage.trim();
        if (!prompt || loading) return;
        setLoading(true);
        setError('');
        setOnlineSongs([]);
        const fallback = makeFallbackBrief(prompt);
        let activeBrief = fallback;
        try {
            const response = await fetch('/api/radio-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: prompt }),
            });
            if (response.ok) {
                const data: unknown = await response.json();
                activeBrief = isBrief(data) ? data : fallback;
                setBrief(activeBrief);
            } else {
                const data = await response.json().catch(() => ({})) as { error?: string };
                activeBrief = fallback;
                setBrief(fallback);
                if (response.status !== 404 && response.status !== 501) setError(data.error || t('radioAgent.aiFallback'));
            }
        } catch {
            activeBrief = fallback;
            setBrief(fallback);
            setError(t('radioAgent.aiFallback'));
        }
        try {
            const terms = activeBrief.searchTerms;
            const found = new Map<string, UnifiedSong>();
            for (const term of terms) {
                try {
                    const page = await omni.searchSongs(term, { limit: 8, offset: 0 });
                    for (const song of page.items ?? []) {
                        const key = JSON.stringify(song.sourceRef ?? {}) + ':' + String(song.id);
                        if (!found.has(key)) found.set(key, song);
                    }
                } catch {
                    // One provider query failing should not cancel the rest of the radio search.
                }
                // Folia's existing Navidrome/Subsonic server is a separate catalogue from Omni.
                // Search it through the established service and convert results to the existing playback carrier.
                try {
                    if (isNavidromeEnabled()) {
                        const config = getNavidromeConfig();
                        if (config) {
                            const serverPage = await navidromeApi.search(config, term, 0, 0, 8);
                            for (const serverSong of serverPage.song ?? []) {
                                const unified = buildUnifiedNavidromeSong(navidromeApi.toNavidromeSong(config, serverSong)) as UnifiedSong;
                                const key = JSON.stringify(unified.sourceRef ?? {}) + ':' + String(unified.id);
                                if (!found.has(key)) found.set(key, unified);
                            }
                        }
                    }
                } catch {
                    // A missing or offline personal server must not block online-provider results.
                }
                if (found.size >= 12) break;
            }
            setOnlineSongs([...found.values()].slice(0, 12));
            if (found.size === 0 && localSongs.length === 0) setError(t('radioAgent.noResults'));
        } catch {
            setError(t('radioAgent.searchFailed'));
        } finally {
            setLoading(false);
        }
    }, [loading, localSongs.length, t]);

    const startVoice = useCallback(() => {
        const speechWindow = window as SpeechWindow;
        const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
        if (!Constructor) {
            setError(t('radioAgent.voiceUnsupported'));
            return;
        }
        try {
            recognitionRef.current?.stop();
            const recognition = new Constructor();
            recognition.lang = /^zh/i.test(navigator.language) ? 'zh-CN' : navigator.language || 'en-US';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            recognition.onresult = event => {
                const transcript = event.results[0]?.[0]?.transcript?.trim();
                if (transcript) {
                    setMessage(transcript);
                    setVoiceListening(false);
                }
            };
            recognition.onerror = event => {
                setVoiceListening(false);
                setError(event.error === 'not-allowed' ? t('radioAgent.voicePermission') : t('radioAgent.voiceFailed'));
            };
            recognition.onend = () => setVoiceListening(false);
            recognitionRef.current = recognition;
            setError('');
            setVoiceListening(true);
            recognition.start();
        } catch {
            setVoiceListening(false);
            setError(t('radioAgent.voiceFailed'));
        }
    }, [t]);

    const speakIntro = useCallback(() => {
        if (!brief?.narration || !('speechSynthesis' in window)) {
            setError(t('radioAgent.narrationUnavailable'));
            return;
        }
        window.speechSynthesis.cancel();
        if (playingIntro) {
            setPlayingIntro(false);
            return;
        }
        const utterance = new SpeechSynthesisUtterance(brief.narration);
        utterance.lang = /^zh/i.test(navigator.language) ? 'zh-CN' : navigator.language || 'en-US';
        utterance.onend = () => setPlayingIntro(false);
        utterance.onerror = () => setPlayingIntro(false);
        setPlayingIntro(true);
        window.speechSynthesis.speak(utterance);
    }, [brief, playingIntro, t]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-xl sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={t('radioAgent.title')}>
            <div className="relative flex h-[min(92dvh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#0b0b10] text-white shadow-2xl sm:h-[min(88dvh,900px)] sm:rounded-[28px]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(94,82,173,0.20),transparent_42%),radial-gradient(ellipse_at_bottom_left,rgba(45,123,119,0.13),transparent_40%)]" />
                <header className="relative flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-7">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-300/10"><Radio size={20} /></div>
                        <div><p className="text-[10px] uppercase tracking-[0.32em] text-violet-200/70">FOLIA · AI RADIO</p><h1 className="text-lg font-medium tracking-wide sm:text-xl">{t('radioAgent.title')}</h1></div>
                    </div>
                    <button type="button" onClick={onClose} aria-label={t('radioAgent.close')} className="rounded-full border border-white/10 p-2.5 text-white/70 transition hover:bg-white/10 hover:text-white"><X size={19} /></button>
                </header>

                <div className="relative grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[0.85fr_1.15fr]">
                    <section className="border-b border-white/10 p-4 sm:p-7 md:overflow-y-auto md:border-b-0 md:border-r">
                        <p className="mb-3 text-xs uppercase tracking-[0.24em] text-white/40">{t('radioAgent.yourMood')}</p>
                        <h2 className="mb-2 text-2xl font-light leading-snug sm:text-3xl">{t('radioAgent.headline')}</h2>
                        <p className="mb-5 max-w-sm text-sm leading-6 text-white/50">{t('radioAgent.description')}</p>
                        <div className="mb-3 flex flex-wrap gap-2">
                            {[t('radioAgent.chipRain'), t('radioAgent.chipFolk'), t('radioAgent.chipFocus')].map(chip => <button key={chip} type="button" onClick={() => setMessage(chip)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/65 transition hover:border-violet-200/40 hover:bg-white/5">{chip}</button>)}
                        </div>
                        <form onSubmit={event => { event.preventDefault(); void createStation(message); }} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 focus-within:border-violet-200/40">
                            <label htmlFor="radio-agent-prompt" className="sr-only">{t('radioAgent.promptLabel')}</label>
                            <textarea id="radio-agent-prompt" value={message} onChange={event => setMessage(event.target.value)} rows={3} maxLength={500} placeholder={t('radioAgent.promptPlaceholder')} className="w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-white/30" />
                            <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                                <div className="flex gap-1.5">
                                    {voiceSupported && <button type="button" onClick={voiceListening ? () => recognitionRef.current?.stop() : startVoice} aria-label={voiceListening ? t('radioAgent.stopListening') : t('radioAgent.voiceInput')} className={`rounded-xl p-2.5 transition ${voiceListening ? 'bg-rose-400/15 text-rose-200' : 'text-white/60 hover:bg-white/10'}`}><Mic size={17} /></button>}
                                    <button type="button" onClick={() => setNarrationEnabled(value => { const next = !value; if (!next && 'speechSynthesis' in window) { window.speechSynthesis.cancel(); setPlayingIntro(false); } return next; })} aria-pressed={narrationEnabled} title={t('radioAgent.narrationToggle')} className={`rounded-xl p-2.5 transition ${narrationEnabled ? 'bg-violet-300/15 text-violet-100' : 'text-white/60 hover:bg-white/10'}`}>{narrationEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
                                </div>
                                <button type="submit" disabled={!message.trim() || loading} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}{loading ? t('radioAgent.working') : t('radioAgent.makeStation')}</button>
                            </div>
                        </form>
                        {voiceListening && <p className="mt-2 flex items-center gap-2 text-xs text-rose-200"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-300" />{t('radioAgent.listening')}</p>}
                        {error && <p role="status" className="mt-3 rounded-xl border border-amber-200/15 bg-amber-200/5 px-3 py-2 text-xs leading-5 text-amber-100/80">{error}</p>}
                        {brief && <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                            <div className="mb-3 flex items-center gap-2 text-violet-100"><Bot size={17} /><span className="text-xs uppercase tracking-[0.2em]">{t('radioAgent.stationBrief')}</span></div>
                            <h3 className="text-lg font-medium">{brief.title}</h3>
                            <p className="mt-1 text-sm text-white/50">{brief.mood} · {brief.energy === 'low' ? t('radioAgent.energyLow') : brief.energy === 'high' ? t('radioAgent.energyHigh') : t('radioAgent.energyMedium')}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">{brief.genres.map(genre => <span key={genre} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60">{genre}</span>)}</div>
                            {narrationEnabled && brief.narration && <button type="button" onClick={speakIntro} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-violet-200/20 px-3 py-2 text-xs text-violet-100 hover:bg-violet-200/10">{playingIntro ? <Pause size={14} /> : <AudioLines size={14} />}{playingIntro ? t('radioAgent.stopIntro') : t('radioAgent.playIntro')}</button>}
                        </div>}
                    </section>

                    <section className="min-h-0 overflow-y-auto p-4 sm:p-7">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div><p className="text-[10px] uppercase tracking-[0.28em] text-emerald-200/65">{t('radioAgent.curation')}</p><h2 className="mt-1 text-lg font-medium">{brief?.title || t('radioAgent.queueTitle')}</h2></div>
                            <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/45">{localMatches.length + onlineSongs.length} {t('radioAgent.tracks')}</span>
                        </div>
                        {!brief && !loading && <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 text-center"><Music2 size={28} className="mb-3 text-white/30" /><p className="text-sm text-white/60">{t('radioAgent.emptyTitle')}</p><p className="mt-1 max-w-xs text-xs leading-5 text-white/35">{t('radioAgent.emptyDescription')}</p></div>}
                        {loading && <div className="flex min-h-44 items-center justify-center gap-3 text-sm text-white/50"><LoaderCircle size={18} className="animate-spin" />{t('radioAgent.searching')}</div>}
                        {brief && !loading && localMatches.length === 0 && onlineSongs.length === 0 && <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/50">{t('radioAgent.noResults')}</div>}
                        <div className="space-y-2">
                            {localMatches.map((song, index) => <div key={song.id} className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 transition hover:border-white/15 hover:bg-white/[0.05]">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-200/10 text-emerald-100/70"><Music2 size={17} /></div>
                                <div className="min-w-0 flex-1"><p className="truncate text-sm text-white/90">{localLabel(song)}</p><p className="mt-1 truncate text-xs text-white/40">{localArtist(song, t('radioAgent.localLibraryFallback'))} · {t('radioAgent.localSource')}</p></div>
                                <span className="hidden text-[10px] text-white/25 sm:inline">{String(index + 1).padStart(2, '0')}</span>
                                <button type="button" onClick={() => onPlayLocal(song)} aria-label={t('radioAgent.play')} className="rounded-full border border-white/10 p-2.5 text-white/70 hover:bg-white/10 hover:text-white"><Play size={15} /></button>
                            </div>)}
                            {onlineSongs.map((song, index) => <div key={String(song.id)} className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 transition hover:border-white/15 hover:bg-white/[0.05]">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-200/10 text-violet-100/70"><Music2 size={17} /></div>
                                <div className="min-w-0 flex-1"><p className="truncate text-sm text-white/90">{song.name}</p><p className="mt-1 truncate text-xs text-white/40">{song.artists?.map(artist => artist.name).join(', ') || t('radioAgent.unknownArtist')} · {song.album?.name || t('radioAgent.onlineSource')}</p></div>
                                <span className="hidden text-[10px] text-white/25 sm:inline">{String(index + localMatches.length + 1).padStart(2, '0')}</span>
                                <button type="button" onClick={() => onPlayOnline(song)} aria-label={t('radioAgent.play')} className="rounded-full border border-white/10 p-2.5 text-white/70 hover:bg-white/10 hover:text-white"><Play size={15} /></button>
                            </div>)}
                        </div>
                        <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.07] p-3 text-[11px] leading-5 text-white/35"><Settings2 size={14} className="mt-0.5 shrink-0" /><span>{t('radioAgent.footerHint')}</span></div>
                    </section>
                </div>
                <footer className="relative flex items-center justify-between border-t border-white/10 px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-white/30 sm:px-7"><span>FOLIA / PERSONAL RADIO</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-200/70" />{t('radioAgent.status')}</span></footer>
            </div>
        </div>
    );
}

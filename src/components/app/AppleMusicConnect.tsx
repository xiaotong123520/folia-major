import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Apple, CheckCircle2, LoaderCircle, Music2, Play, Search, ShieldCheck, X } from 'lucide-react';

type MusicKitSong = {
    id: string;
    attributes?: { name?: string; artistName?: string; albumName?: string; artwork?: { url?: string } };
};
type MusicKitInstance = {
    authorize: () => Promise<string>;
    unauthorize: () => Promise<void>;
    api: { search: (term: string, options: { types: string[]; limit: number }) => Promise<{ songs?: { data?: MusicKitSong[] } }> };
    setQueue: (options: { song: string }) => Promise<unknown>;
    play: () => Promise<void>;
    pause: () => void;
    isAuthorized?: boolean;
};
type MusicKitWindow = Window & { MusicKit?: { configure: (options: { developerToken: string; app: { name: string; build: string } }) => Promise<MusicKitInstance> } };

const loadMusicKit = async (): Promise<NonNullable<MusicKitWindow['MusicKit']>> => {
    const musicWindow = window as MusicKitWindow;
    if (musicWindow.MusicKit) return musicWindow.MusicKit;
    await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-folia-musickit]');
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => { existing.remove(); reject(new Error('Apple MusicKit could not be loaded.')); }, { once: true });
            if (musicWindow.MusicKit) resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
        script.async = true;
        script.dataset.foliaMusickit = 'true';
        script.onload = () => resolve();
        script.onerror = () => { script.remove(); reject(new Error('Apple MusicKit could not be loaded. Check your network and try again.')); };
        document.head.appendChild(script);
    });
    const loaded = (window as MusicKitWindow).MusicKit;
    if (!loaded) throw new Error('Apple MusicKit did not initialize. Please reload Folia.');
    return loaded;
};

type Props = { onClose: () => void };

export default function AppleMusicConnect({ onClose }: Props) {
    const { t } = useTranslation();
    const [music, setMusic] = useState<MusicKitInstance | null>(null);
    const [authorized, setAuthorized] = useState(false);
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState('');
    const [songs, setSongs] = useState<MusicKitSong[]>([]);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [playingId, setPlayingId] = useState('');

    useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);

    const signIn = useCallback(async () => {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const response = await fetch('/api/apple-music-token', { cache: 'no-store' });
            const data = await response.json() as { token?: string; error?: string };
            if (!response.ok || !data.token) throw new Error(data.error || t('appleMusic.tokenUnavailable'));
            const kit = await loadMusicKit();
            const instance = await kit.configure({ developerToken: data.token, app: { name: 'Folia', build: '0.7.21' } });
            await instance.authorize();
            setMusic(instance);
            setAuthorized(true);
            setNotice(t('appleMusic.authorizedNotice'));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : t('appleMusic.authorizationFailed'));
        } finally {
            setBusy(false);
        }
    }, []);

    const search = useCallback(async () => {
        if (!music || !query.trim()) return;
        setBusy(true);
        setError('');
        try {
            const result = await music.api.search(query.trim(), { types: ['songs'], limit: 12 });
            setSongs(result.songs?.data ?? []);
            if (!result.songs?.data?.length) setNotice(t('appleMusic.noResults'));
            else setNotice('');
        } catch {
            setError(t('appleMusic.searchFailed'));
        } finally {
            setBusy(false);
        }
    }, [music, query]);

    const play = useCallback(async (song: MusicKitSong) => {
        if (!music) return;
        setBusy(true);
        setError('');
        try {
            await music.setQueue({ song: song.id });
            await music.play();
            setPlayingId(song.id);
        } catch {
            setError(t('appleMusic.playFailed'));
        } finally {
            setBusy(false);
        }
    }, [music]);

    const signOut = useCallback(async () => {
        setBusy(true);
        try { await music?.unauthorize(); } catch { /* Local authorization state is still cleared. */ }
        setAuthorized(false);
        setMusic(null);
        setSongs([]);
        setPlayingId('');
        setNotice(t('appleMusic.signedOut'));
        setBusy(false);
    }, [music]);

    return (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 p-0 backdrop-blur-xl sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="folia-apple-music-title">
            <section className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#101015] text-white shadow-2xl sm:rounded-[28px]">
                <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-500/15 text-pink-200"><Apple size={21} /></div>
                        <div><h2 id="folia-apple-music-title" className="font-medium">Apple Music</h2><p className="text-xs text-white/45">官方账号授权 · Folia</p></div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full border border-white/10 p-2 text-white/65 hover:bg-white/10"><X size={18} /></button>
                </header>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                    {!authorized ? <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                        <div className="mb-3 flex items-center gap-2 text-emerald-200"><ShieldCheck size={18} /><span className="text-sm font-medium">使用苹果官方授权登录</span></div>
                        <p className="mb-4 text-sm leading-6 text-white/55">Folia 不会收集或保存你的 Apple ID 密码。点击后将加载 Apple Music 官方授权流程。若尚未配置服务端开发者凭据，页面会明确提示。</p>
                        <button type="button" onClick={() => void signIn()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-pink-50 disabled:opacity-50">{busy ? <LoaderCircle size={17} className="animate-spin" /> : <Apple size={17} />}{busy ? t('appleMusic.connecting') : t('appleMusic.signIn')}</button>
                    </div> : <div className="flex items-center justify-between rounded-2xl border border-emerald-200/20 bg-emerald-200/5 p-4">
                        <div className="flex items-center gap-2 text-emerald-100"><CheckCircle2 size={18} /><span className="text-sm">Apple Music 已授权</span></div>
                        <button type="button" onClick={() => void signOut()} disabled={busy} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65 hover:bg-white/10">退出授权</button>
                    </div>}
                    {authorized && <form onSubmit={event => { event.preventDefault(); void search(); }} className="flex gap-2">
                        <label htmlFor="folia-apple-music-search" className="sr-only">搜索 Apple Music 歌曲</label>
                        <input id="folia-apple-music-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索歌曲、歌手或专辑" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-pink-200/40" />
                        <button type="submit" disabled={busy || !query.trim()} className="rounded-xl bg-pink-200 px-4 text-black disabled:opacity-50"><Search size={18} /></button>
                    </form>}
                    {notice && <p role="status" className="rounded-xl border border-emerald-200/15 bg-emerald-200/5 p-3 text-xs leading-5 text-emerald-100/80">{notice}</p>}
                    {error && <p role="alert" className="rounded-xl border border-amber-200/20 bg-amber-200/5 p-3 text-xs leading-5 text-amber-100/90">{error}</p>}
                    <div className="space-y-2">
                        {songs.map(song => <div key={song.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                            {song.attributes?.artwork?.url ? <img src={song.attributes.artwork.url.replace('{w}', '96').replace('{h}', '96')} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-pink-200/10"><Music2 size={17} /></div>}
                            <div className="min-w-0 flex-1"><p className="truncate text-sm">{song.attributes?.name || t('appleMusic.unknownSong')}</p><p className="mt-1 truncate text-xs text-white/45">{song.attributes?.artistName || song.attributes?.albumName || t('appleMusic.name')}</p></div>
                            <button type="button" onClick={() => void play(song)} disabled={busy} aria-label={t('appleMusic.playSong', { song: song.attributes?.name || t('appleMusic.song') })} className="rounded-full border border-white/10 p-2.5 text-white/75 hover:bg-white/10 disabled:opacity-40">{playingId === song.id ? <CheckCircle2 size={15} /> : <Play size={15} />}</button>
                        </div>)}
                    </div>
                    <p className="text-[11px] leading-5 text-white/35">播放由 Apple MusicKit 处理，不会绕过订阅或地区限制。授权令牌只保存在当前页面内存中；关闭页面后不持久化。</p>
                </div>
            </section>
        </div>
    );
}

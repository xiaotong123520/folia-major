import { useEffect, useRef, useState } from 'react';
import { Disc3, HardDrive, LockKeyhole, Pause, Play, RefreshCw, Search, SkipBack, SkipForward } from 'lucide-react';

// Mobile browser for audio already stored on the owner's Baota server; no uploads or file mutations.
type ServerSong = {
    id: string;
    source: 'local';
    name: string;
    artist?: string;
    album?: string;
    streamUrl?: string;
};

const STORAGE_KEY = 'tongsheng_server_audio_origin';
const compiledOrigin = String(import.meta.env.VITE_AUDIO_LIBRARY_BASE_URL ?? '');

function normalizeOrigin(input: string): string {
    try {
        const parsed = new URL(input.trim());
        if (parsed.protocol !== 'https:' &&
            !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return '';
        if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return '';
        return parsed.origin;
    } catch {
        return '';
    }
}

export default function ServerAudioLibrary() {
    const [address, setAddress] = useState(() => localStorage.getItem(STORAGE_KEY) || compiledOrigin);
    const [origin, setOrigin] = useState(() => normalizeOrigin(localStorage.getItem(STORAGE_KEY) || compiledOrigin));
    const [readToken, setReadToken] = useState('');
    const [keyword, setKeyword] = useState('');
    const [songs, setSongs] = useState<ServerSong[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [currentId, setCurrentId] = useState('');
    const [playing, setPlaying] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastRequestRef = useRef(0);
    const pageSize = 30;

    const search = async (server: string, query = keyword, page = 0, credential = readToken) => {
        if (!server) { setNotice('请先设置你的宝塔音乐接口 HTTPS 地址。'); return; }
        const request = ++lastRequestRef.current;
        setBusy(true);
        setNotice('');
        try {
            const api = new URL('/api/v1/music/search', server);
            api.searchParams.set('q', query.trim());
            api.searchParams.set('limit', String(pageSize));
            api.searchParams.set('offset', String(page));
            const response = await fetch(api.toString(), {
                headers: credential.trim() ? { Authorization: `Bearer ${credential.trim()}` } : {},
                cache: 'no-store',
            });
            const result = await response.json() as {
                code?: number; msg?: string;
                data?: { songs?: ServerSong[]; total?: number };
            };
            if (!response.ok) {
                throw new Error(response.status === 401
                    ? '服务器启用了私有曲库，请输入只读访问口令。'
                    : result.msg || `服务器错误：HTTP ${response.status}`);
            }
            if (request !== lastRequestRef.current) return;
            const records = (result.data?.songs ?? []).filter(song =>
                typeof song.id === 'string' && /^[a-f0-9]{24}$/.test(song.id) &&
                song.source === 'local' && typeof song.name === 'string' &&
                typeof song.streamUrl === 'string' &&
                song.streamUrl.startsWith('/api/v1/music/stream?')
            );
            const count = Math.max(0, Number(result.data?.total) || 0);
            setSongs(records);
            setTotal(count);
            setOffset(page);
            if (!records.length) {
                setNotice(count > 0
                    ? '曲库已连接，但播放地址未配置。请在宝塔端设置 MUSIC_STREAM_SIGNING_KEY。'
                    : '连接成功，但没有找到音乐。请确认服务器扫描目录和索引。');
            }
        } catch (error) {
            if (request === lastRequestRef.current) {
                setSongs([]);
                setTotal(0);
                setNotice(error instanceof Error ? error.message : '连接失败；请检查 HTTPS、跨域白名单和服务器配置。');
            }
        } finally {
            if (request === lastRequestRef.current) setBusy(false);
        }
    };

    useEffect(() => {
        if (origin) void search(origin, '', 0, '');
        // Only try unauthenticated access once; the read token is kept in memory, not localStorage.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const connect = () => {
        const next = normalizeOrigin(address);
        if (!next) { setNotice('请输入有效的 HTTPS 域名，例如 https://music.example.com。'); return; }
        audioRef.current?.pause();
        setCurrentId('');
        setPlaying(false);
        localStorage.setItem(STORAGE_KEY, next);
        setOrigin(next);
        void search(next, keyword, 0);
    };

    const playSong = (song: ServerSong) => {
        if (!origin || !song.streamUrl) return;
        const target = new URL(song.streamUrl, origin);
        if (target.origin !== origin || target.pathname !== '/api/v1/music/stream') return;
        setNotice('');
        const player = audioRef.current;
        if (!player) return;
        if (currentId === song.id) {
            if (player.paused) {
                void player.play().then(() => setPlaying(true)).catch(() => setNotice('请再点一次播放；手机浏览器可能限制自动播放。'));
            } else {
                player.pause();
                setPlaying(false);
            }
            return;
        }
        player.pause();
        player.src = target.toString();
        player.load();
        setCurrentId(song.id);
        setPlaying(false);
        // Initiated by the person's tap; avoids relying on autoplay after an async effect.
        void player.play().then(() => setPlaying(true)).catch(() => setNotice('点一下播放器中的播放键开始收听。'));
    };

    const currentIndex = songs.findIndex(song => song.id === currentId);
    const current = songs[currentIndex];
    const seekItem = (index: number) => {
        const item = songs[index];
        if (item) playSong(item);
    };

    return (
        <section aria-label="宝塔服务器音乐" className="w-full space-y-4 text-white">
            <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs font-medium tracking-[0.16em] text-violet-200"><HardDrive size={16}/> BAOTA AUDIO</p>
                <h2 className="text-2xl font-semibold">服务器原有音乐</h2>
                <p className="text-sm leading-6 text-white/55">直接读取宝塔原有音频文件，不搬运、不修改、不上传。私有曲库可使用单独的只读口令。</p>
            </div>
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <label className="block space-y-2 text-sm text-white/75">
                    <span className="flex items-center gap-2"><HardDrive size={16}/> 服务器接口地址</span>
                    <input type="url" value={address} inputMode="url" autoComplete="url"
                        placeholder="https://music.example.com"
                        onChange={event => setAddress(event.target.value)}
                        className="min-h-12 w-full rounded-xl border border-white/15 bg-black/35 px-3 text-base text-white outline-none focus:border-violet-200" />
                </label>
                <label className="block space-y-2 text-sm text-white/75">
                    <span className="flex items-center gap-2"><LockKeyhole size={16}/> 只读访问口令（公开曲库可留空）</span>
                    <input type="password" value={readToken} autoComplete="off"
                        onChange={event => setReadToken(event.target.value)}
                        placeholder="使用只读口令，切勿输入宝塔管理员密码"
                        className="min-h-12 w-full rounded-xl border border-white/15 bg-black/35 px-3 text-base text-white outline-none focus:border-violet-200" />
                </label>
                <button type="button" disabled={busy} onClick={connect}
                    className="flex min-h-11 items-center gap-2 rounded-xl bg-violet-200 px-4 text-sm font-semibold text-[#181020] disabled:opacity-50">
                    <RefreshCw size={16}/>{busy ? '正在连接…' : '连接并读取服务器音乐'}
                </button>
            </div>
            <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); void search(origin, keyword, 0); }}>
                <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3">
                    <Search size={18} className="shrink-0 text-white/50"/>
                    <input type="search" value={keyword} onChange={event => setKeyword(event.target.value)}
                        placeholder="搜索歌名 / 歌手" className="min-w-0 w-full bg-transparent text-base text-white outline-none" />
                </label>
                <button type="submit" disabled={busy || !origin}
                    className="min-h-12 rounded-xl border border-violet-300/30 px-4 text-sm text-violet-100 disabled:opacity-40">搜索</button>
            </form>
            {notice && <p role="status" className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-amber-100">{notice}</p>}
            <div className={current ? 'sticky top-0 z-10 space-y-2 rounded-2xl border border-violet-300/25 bg-[#1b1926] p-4 shadow-2xl' : 'hidden'}>
                    <p className="truncate text-sm font-semibold">{current?.name ?? ''}</p>
                    <p className="truncate text-xs text-white/55">{current?.artist || '服务器音乐'}</p>
                    <audio ref={audioRef} controls preload="metadata" className="h-12 w-full"
                        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                        onError={() => { setPlaying(false); setNotice('播放失败：请刷新曲库获取新的播放地址，并检查文件格式、Range/206 和服务器访问权限。'); }} />
                    <div className="flex items-center justify-center gap-6">
                        <button type="button" disabled={currentIndex <= 0} onClick={() => seekItem(currentIndex - 1)}
                            aria-label="上一首" className="min-h-11 min-w-11 disabled:opacity-30"><SkipBack size={22}/></button>
                        <span className="flex items-center gap-2 text-xs text-white/55">{playing ? <Pause size={14}/> : <Play size={14}/>} {currentIndex + 1} / {songs.length}</span>
                        <button type="button" disabled={currentIndex >= songs.length - 1} onClick={() => seekItem(currentIndex + 1)}
                            aria-label="下一首" className="min-h-11 min-w-11 disabled:opacity-30"><SkipForward size={22}/></button>
                    </div>
                </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-white/50">
                    <span>已找到 {total} 首</span><span>{offset + (songs.length ? 1 : 0)}—{offset + songs.length}</span>
                </div>
                {songs.map(song => (
                    <button key={song.id} type="button" onClick={() => playSong(song)}
                        className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3 text-left ${song.id === currentId ? 'border-violet-300/50 bg-violet-300/10' : 'border-white/10 bg-white/[0.04]'}`}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                            {song.id === currentId && playing ? <Pause size={20}/> : <Disc3 size={21}/>}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{song.name}</span>
                            <span className="block truncate text-xs text-white/45">{[song.artist, song.album].filter(Boolean).join(' · ') || '本地曲库'}</span>
                        </span>
                        <Play size={16} className="shrink-0 text-white/40"/>
                    </button>
                ))}
                {total > pageSize && <div className="flex justify-between gap-2 pt-2">
                    <button type="button" disabled={busy || offset === 0} onClick={() => void search(origin, keyword, Math.max(0, offset - pageSize))}
                        className="min-h-11 rounded-xl border border-white/15 px-4 text-sm disabled:opacity-35">上一页</button>
                    <button type="button" disabled={busy || offset + pageSize >= total} onClick={() => void search(origin, keyword, offset + pageSize)}
                        className="min-h-11 rounded-xl border border-white/15 px-4 text-sm disabled:opacity-35">下一页</button>
                </div>}
            </div>
        </section>
    );
}

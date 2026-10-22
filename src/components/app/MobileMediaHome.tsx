import type { PointSongImport } from '../../services/directPointSong';
import { lazy, Suspense, useState } from 'react';
import { AudioLines, ChevronRight, Disc3, Film, Home, Link2, ListMusic, Music2, Radio, Server, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openLoginWindow } from '../login/loginWindowStore';
import MobilePlatformLibrary, { type MobileLibraryActions } from './MobilePlatformLibrary';
import MobilePlatformAccess from './MobilePlatformAccess';

// A real phone landing screen replaces the cropped desktop lattice on narrow viewports.
const HearttraceLibrary = lazy(() => import('./hearttraceLibrary/HearttraceLibrary'));
const ServerAudioLibrary = lazy(() => import('./ServerAudioLibrary'));
type Tab = 'home' | 'music' | 'server' | 'more';

export default function MobileMediaHome({ onImport, onRadio, onApple, onVideos, onImportFiles, mobileActions, onAddServerTrack }: {
    onAddServerTrack: (track: PointSongImport) => boolean;
    mobileActions: MobileLibraryActions;
    onImport: () => void;
    onRadio: () => void;
    onApple: () => void;
    onVideos: () => void;
    onImportFiles: (files: File[]) => number;
}) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<Tab>('home');
    const [serverVisited, setServerVisited] = useState(false);
    const [classic, setClassic] = useState(false);
    const [hint, setHint] = useState('');
    const selectTab = (next: Tab) => {
        if (next === 'server') setServerVisited(true);
        setTab(next);
    };
    const nav = [
        { key: 'home' as const, title: '首页', icon: Home },
        { key: 'music' as const, title: '音乐', icon: Music2 },
        { key: 'video' as const, title: '视频', icon: Film },
        { key: 'more' as const, title: '更多', icon: ListMusic },
    ];
    const title = { home: '发现好声音', music: '我的音乐', server: '服务器音乐', more: '我的空间' }[tab];
    const workspace = (action: () => void) => { setClassic(true); action(); };
    if (classic) {
        return <nav aria-label={t('mobileLibrary.navigation')}
            className="fixed bottom-0 left-0 right-0 z-[85] flex items-center justify-around border-t border-white/15 bg-[#17151f]/95 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 text-white backdrop-blur-xl sm:hidden">
            <button type="button" onClick={() => setClassic(false)} className="min-h-12 px-3 text-sm"><Home size={19} className="mx-auto mb-1"/>{t('mobileLibrary.home')}</button>
            <button type="button" onClick={() => openLoginWindow()} className="min-h-12 px-3 text-sm"><Music2 size={19} className="mx-auto mb-1"/>{t('mobileLibrary.platforms')}</button>
            <button type="button" onClick={mobileActions.onPlayer} className="min-h-12 px-3 text-sm"><Disc3 size={19} className="mx-auto mb-1"/>{t('mobileLibrary.player')}</button>
            <button type="button" onClick={mobileActions.onSettings} className="min-h-12 px-3 text-sm"><ListMusic size={19} className="mx-auto mb-1"/>{t('mobileLibrary.settings')}</button>
        </nav>;
    }

    return (
        <div className="fixed inset-0 z-[82] flex flex-col overflow-hidden bg-[#08090d] text-white sm:hidden"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-violet-800/15 blur-[90px]" />
            <header className="relative flex h-16 shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-200 text-[#17101f]"><AudioLines size={22}/></span>
                    <span className="text-lg font-semibold tracking-wide">桐声音乐</span>
                </div>
                <MobilePlatformAccess compact onSettings={mobileActions.onSettings} onOpenWorkspace={() => workspace(() => mobileActions.onLibrary('playlist'))} />
            </header>
            <main className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-40 pt-6"
                >
                <div className="mx-auto w-full max-w-xl space-y-6">
                    {tab === 'home' && <>
                        <div className="space-y-2 pt-3">
                            <p className="text-xs font-medium tracking-[0.22em] text-violet-200">TONGSHENG · 随身音乐空间</p>
                            <h1 className="text-[32px] font-semibold leading-tight tracking-tight">{title}</h1>
                            <p className="text-sm leading-6 text-white/50">在手机上聆听音乐，随时观看服务器里的视频。</p>
                        </div>
                        <button type="button" onClick={() => setTab('music')}
                            className="relative flex min-h-44 w-full flex-col justify-between overflow-hidden rounded-[28px] border border-violet-300/20 bg-gradient-to-br from-[#6b45a1] via-[#34284d] to-[#15131e] p-6 text-left shadow-xl">
                            <Disc3 size={32} className="text-violet-100" />
                            <span className="flex w-full items-end justify-between gap-2"><span><span className="block text-xl font-semibold">开始听音乐</span><span className="mt-1 block text-xs text-white/65">本地上传 · 在线点歌 · 音乐电台</span></span><ChevronRight size={23}/></span>
                        </button>
                        <button type="button" onClick={() => selectTab('server')}
                            className="flex min-h-36 w-full items-center justify-between gap-4 rounded-[28px] border border-violet-300/20 bg-[#1b1a25] p-6 text-left">
                            <span className="space-y-2"><Server size={29} className="text-violet-200"/><span className="block text-xl font-semibold">服务器原有音乐</span><span className="block text-xs text-white/50">直接读取宝塔里的歌曲，不用上传</span></span>
                            <ChevronRight size={23} className="text-white/50"/>
                        </button>
                        <button type="button" onClick={onVideos}
                            className="flex min-h-36 w-full items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-[#181923] p-6 text-left">
                            <span className="space-y-2"><Film size={29} className="text-violet-200"/><span className="block text-xl font-semibold">我的视频库</span><span className="block text-xs text-white/50">连接宝塔 · 上传和播放视频</span></span>
                            <ChevronRight size={23} className="text-white/50"/>
                        </button>
                        <p className="flex items-center gap-2 text-xs text-white/40"><Server size={15}/> 宝塔媒体服务需要单独连接后使用</p>
                    </>}
                    {tab === 'music' && <>
                        <MobilePlatformLibrary {...mobileActions}
                            onLibrary={value => workspace(() => mobileActions.onLibrary(value))}
                            onSearch={query => workspace(() => mobileActions.onSearch(query))}
                            onPlayer={() => workspace(mobileActions.onPlayer)} />
                        <div className="space-y-2"><p className="text-xs tracking-[0.2em] text-violet-200">YOUR MUSIC</p><h1 className="text-3xl font-semibold">{title}</h1><p className="text-sm text-white/50">音乐文件可以保存在当前手机浏览器中。</p></div>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={onImport}
                                className="flex min-h-40 flex-col items-start justify-between rounded-3xl bg-violet-200 p-5 text-left text-[#191020]">
                                <Link2 size={26}/><span className="text-lg font-semibold">在线点歌</span>
                            </button>
                            <label className="relative flex min-h-40 cursor-pointer flex-col items-start justify-between rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-left">
                                <Upload size={26} className="text-violet-200"/><span className="text-lg font-semibold">导入音乐</span>
                                <input aria-label="从手机导入本地音乐" className="absolute h-px w-px opacity-0" type="file"
                                    multiple accept=".mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.webm"
                                    onChange={event => {
                                        const files = Array.from(event.currentTarget.files ?? []);
                                        if (files.length) {
                                            const accepted = onImportFiles(files);
                                            setHint(accepted > 0 ? `已导入 ${accepted} 首，底部播放器可以播放。` : '没有识别到可播放的音乐文件。');
                                        }
                                        event.currentTarget.value = '';
                                    }} />
                            </label>
                            <button type="button" onClick={onRadio}
                                className="flex min-h-32 flex-col items-start justify-between rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-left">
                                <Radio size={25} className="text-violet-200"/><span className="text-lg font-semibold">音乐电台</span>
                            </button>
                            <button type="button" onClick={onApple}
                                className="flex min-h-32 flex-col items-start justify-between rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-left">
                                <Music2 size={25} className="text-violet-200"/><span className="text-lg font-semibold">Apple Music</span>
                            </button>
                        </div>
                        {hint && <p role="status" className="text-sm text-violet-100">{hint}</p>}
                        <button type="button" onClick={() => selectTab('server')}
                            className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-violet-300/25 bg-violet-300/10 p-4 text-left">
                            <Server size={23} className="text-violet-200"/><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">连接宝塔服务器原有音乐</span><span className="block text-xs text-white/55">在线读取和播放，无须重新上传</span></span><ChevronRight size={19}/>
                        </button>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-6 text-white/55">
                            手机导入的音乐只存在当前浏览器。想在手机和电脑使用同一份曲库，请连接宝塔服务器。
                        </div>
                        <MobilePlatformAccess onSettings={mobileActions.onSettings} onOpenWorkspace={() => workspace(() => mobileActions.onLibrary('playlist'))} />
                    </>}
                    <div className={tab === 'server' ? 'space-y-4' : 'hidden'}>
                        <button type="button" onClick={() => setTab('music')} className="flex min-h-11 items-center gap-2 text-sm text-violet-200"><ChevronRight size={17} className="rotate-180"/> 返回我的音乐</button>
                        {serverVisited && <Suspense fallback={<p role="status" className="text-sm text-white/60">{t('mobileAccess.loading')}</p>}>
                            <div className="space-y-8">
                                <HearttraceLibrary onAddTrack={onAddServerTrack} />
                                <details className="rounded-2xl border border-white/10 p-4">
                                    <summary className="min-h-11 cursor-pointer text-sm text-violet-200">{t('hearttraceLibrary.otherServer')}</summary>
                                    <ServerAudioLibrary />
                                </details>
                            </div>
                        </Suspense>}
                    </div>
                    {tab === 'more' && <>
                        <div className="space-y-2"><p className="text-xs tracking-widest text-violet-200">SETTINGS</p><h1 className="text-3xl font-semibold">{title}</h1></div>
                        <MobilePlatformAccess onSettings={mobileActions.onSettings} onOpenWorkspace={() => workspace(() => mobileActions.onLibrary('playlist'))} />
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-white/60">
                            将网站添加到主屏幕：iPhone Safari → 分享 → 添加到主屏幕。电脑继续使用原有布局。
                        </div>
                    </>}
                </div>
            </main>
            <nav aria-label="手机主导航" className="absolute bottom-0 left-0 right-0 z-[83] grid grid-cols-4 border-t border-white/10 bg-[#11111a]/95 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
                {nav.map(({ key, title: label, icon: Icon }) => (
                    <button key={key} type="button" onClick={() => key === 'video' ? onVideos() : setTab(key)}
                        aria-current={(tab === key || (key === 'music' && tab === 'server')) ? 'page' : undefined}
                        className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] ${(tab === key || (key === 'music' && tab === 'server')) ? 'text-violet-200' : 'text-white/45'}`}>
                        <Icon size={22}/>{label}
                    </button>
                ))}
            </nav>
        </div>
    );
}

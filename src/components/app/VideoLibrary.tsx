import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Film, LoaderCircle, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import {
    adminVideoUrl, listServerVideos, videoApiBase, videoStreamUrl,
    type ServerVideo,
} from '../../services/serverVideoLibrary';

export default function VideoLibrary({ onClose }: { onClose: () => void }) {
    const base = useMemo(() => videoApiBase(), []);
    const [videos, setVideos] = useState<ServerVideo[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const refresh = useCallback(async () => {
        if (!base) return;
        setLoading(true);
        setError('');
        try {
            const rows = await listServerVideos(base);
            setVideos(rows);
            setSelected(value => rows.some(row => row.id === value) ? value : rows[0]?.id ?? null);
        } catch {
            setError('无法读取宝塔视频库。请检查 HTTPS、PHP API、公开视频开关及 GitHub Pages 跨域配置。');
        } finally {
            setLoading(false);
        }
    }, [base]);
    useEffect(() => { void refresh(); }, [refresh]);
    const current = videos.find(v => v.id === selected) ?? null;
    const stream = base && current ? videoStreamUrl(base, current.id) : null;
    return (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/80 p-0 backdrop-blur-lg sm:items-center sm:p-6"
             role="dialog" aria-modal="true" aria-label="桐声视频库">
            <section className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#12121a] text-white sm:rounded-3xl">
                <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                        <h2 className="flex items-center gap-2 text-lg font-semibold"><Film size={20}/> 视频库</h2>
                        <p className="mt-1 text-xs text-white/50">GitHub 前端 · 宝塔服务器音视频存储</p>
                    </div>
                    <button type="button" aria-label="关闭视频库" onClick={onClose}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/10">
                        <X size={20} />
                    </button>
                </header>
                <div className="space-y-4 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(24px,env(safe-area-inset-bottom))] sm:px-6">
                    {!base ? (
                        <div className="space-y-2 rounded-2xl border border-amber-200/20 bg-amber-200/5 p-5">
                            <h3 className="font-medium">等待连接宝塔视频服务器</h3>
                            <p className="text-sm leading-6 text-white/65">
                                GitHub Pages 本身不能接收视频上传。管理员需要先部署 PHP 视频服务，
                                再将 HTTPS 接口地址设置为仓库变量 VITE_TONGSHENG_VIDEO_API_URL。
                            </p>
                        </div>
                    ) : <>
                        <div className="flex flex-wrap items-center gap-2">
                            <a href={adminVideoUrl(base)} target="_blank" rel="noopener noreferrer"
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-200 px-4 text-sm font-semibold text-black">
                                <ShieldCheck size={17}/> 管理员上传视频 <ExternalLink size={14}/>
                            </a>
                            <button type="button" onClick={() => void refresh()} disabled={loading}
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-3 text-sm disabled:opacity-50">
                                {loading ? <LoaderCircle size={17} className="animate-spin"/> : <RefreshCcw size={17}/>} 刷新视频
                            </button>
                        </div>
                        {error && <p role="alert" className="rounded-xl border border-amber-200/20 bg-amber-100/5 p-3 text-sm text-amber-100">{error}</p>}
                        {current && stream && <div className="space-y-2">
                            <video
                                key={current.id}
                                src={stream}
                                controls
                                playsInline
                                preload="metadata"
                                className="aspect-video max-h-[55dvh] w-full rounded-2xl bg-black object-contain"
                                onError={() => setError('视频不能播放。请检查视频是否为 H.264/AAC MP4、服务器是否允许 Range 请求。')}
                            />
                            <p className="truncate text-sm font-medium">{current.title}</p>
                            <p className="text-xs text-white/50">播放来自你的宝塔 HTTPS 服务器，支持浏览器自带拖动控制。</p>
                        </div>}
                        {!loading && !error && videos.length === 0 && (
                            <p className="rounded-2xl bg-white/5 p-5 text-sm text-white/65">暂无视频。管理员可以先上传一段 MP4 测试。</p>
                        )}
                        {videos.length > 0 && <div className="space-y-2">
                            <h3 className="text-sm font-medium">全部视频 · {videos.length}</h3>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {videos.map(video => (
                                    <button type="button" key={video.id} onClick={() => { setSelected(video.id); setError(''); }}
                                        aria-pressed={selected === video.id}
                                        className={'flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ' + (selected === video.id ? 'border-violet-200/60 bg-violet-200/10' : 'border-white/10 bg-white/[0.04]')}>
                                        <Film size={20} className="shrink-0 text-violet-200" />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">{video.title}</span>
                                            <span className="block text-xs text-white/50">{(video.size / 1024 / 1024).toFixed(1)} MB · {video.mime.split('/')[1]}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>}
                    </>}
                </div>
            </section>
        </div>
    );
}

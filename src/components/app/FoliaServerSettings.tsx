import { useState } from 'react';
import { CheckCircle2, LoaderCircle, Server, ShieldCheck, WifiOff, X } from 'lucide-react';
import {
    clearFoliaServerBase,
    getFoliaServerBase,
    normalizeFoliaServerBase,
    probeFoliaServer,
    saveFoliaServerBase,
} from '../../services/foliaServerFallback';

type Props = { onClose: () => void };

export default function FoliaServerSettings({ onClose }: Props) {
    const current = getFoliaServerBase();
    const [input, setInput] = useState(current ?? '');
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState('');
    const [verified, setVerified] = useState(false);

    const save = async () => {
        const normalized = normalizeFoliaServerBase(input);
        if (!normalized) {
            setError('请输入服务器的 HTTPS 地址，例如 https://music-api.example.com，不要填路径、账号或密码。');
            setVerified(false);
            return;
        }
        setTesting(true);
        setError('');
        setVerified(false);
        try {
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 8000);
            let healthy = false;
            try {
                healthy = await probeFoliaServer(normalized, controller.signal);
            } finally {
                window.clearTimeout(timeout);
            }
            if (!healthy) {
                setError('该地址没有返回 Folia 服务健康状态，请确认宝塔 HTTPS 反向代理、Docker 和跨域白名单已配置。');
                return;
            }
            if (!saveFoliaServerBase(normalized)) {
                setError('浏览器无法保存该地址，请检查隐私模式或浏览器存储权限。');
                return;
            }
            setVerified(true);
            // Provider transports cache their API base on first use. Reload after a successful
            // health-check so every service reads the same backend and no stale source survives.
            window.location.reload();
        } catch {
            setError('连接失败或超时。请检查域名、HTTPS 证书、/api/healthz 和允许 GitHub Pages 来源的 CORS 配置。');
        } finally {
            setTesting(false);
        }
    };

    return <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/80 p-0 backdrop-blur-xl sm:items-center sm:p-6"
        role="dialog" aria-modal="true" aria-labelledby="folia-server-settings-title">
        <section className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-[#15151d] text-white shadow-2xl sm:rounded-3xl">
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
                <div className="flex items-center gap-3"><Server className="text-emerald-200" size={20} />
                    <h2 id="folia-server-settings-title" className="font-medium">服务器音乐解析与兜底</h2>
                </div>
                <button type="button" onClick={onClose} aria-label="关闭服务器设置" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><X size={20}/></button>
            </header>
            <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6">
                <div className="flex items-start gap-3 rounded-xl bg-emerald-200/5 p-3 text-xs leading-6 text-white/70">
                    <ShieldCheck size={18} className="mt-1 shrink-0 text-emerald-200"/>
                    <span>网站继续由 GitHub Pages 托管。服务器提供在线音乐适配器和 AI 接口。必须是你自己的 Folia HTTPS 网关，不能直接填音乐平台的首页，也不会绕过会员或版权限制。</span>
                </div>
                <label htmlFor="folia-server-input" className="block text-sm text-white/80">宝塔服务器 HTTPS 网关地址</label>
                <input id="folia-server-input" type="url" value={input}
                    onChange={event => {setInput(event.target.value);setError('');setVerified(false);}}
                    spellCheck={false} autoCapitalize="off" autoComplete="url"
                    placeholder="https://music-api.example.com"
                    className="min-h-12 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base outline-none focus:border-emerald-200/60" />
                {current && <p className="break-all text-xs text-emerald-200">当前已配置：{current}</p>}
                <button type="button" disabled={testing} onClick={() => void save()}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-200 px-4 py-3 font-semibold text-black disabled:opacity-50">
                    {testing && <LoaderCircle size={18} className="animate-spin" />}
                    {testing ? '正在检测服务器连接…' : '检测连接并保存'}
                </button>
                {verified && <p className="flex gap-2 text-sm text-emerald-200"><CheckCircle2 size={17}/>连接成功，正在切换解析服务。</p>}
                {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm leading-6 text-amber-100"><WifiOff size={18} className="mt-1 shrink-0"/>{error}</p>}
                {current && <button type="button" className="min-h-11 w-full rounded-xl border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
                    onClick={() => {clearFoliaServerBase();window.location.reload();}}>移除服务器设置，恢复纯静态模式</button>}
                <p className="text-xs leading-6 text-white/50">仅保存公开服务器地址，不上传本地音乐，也不存储服务器管理密码。服务器应配置 TLS、访问控制和明确的跨域来源。修改后网站会刷新一次。</p>
            </div>
        </section>
    </div>;
}

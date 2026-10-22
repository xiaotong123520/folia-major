import { useState } from 'react';
import { AudioLines, Link2, Music2, Radio, X, Upload, ChevronRight, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// A mobile-first music entry; on desktop retain the compact original toolbar.
export default function PersonalMusicTools({ onImport, onRadio, onApple, onImportFiles }: {
    onImport: () => void;
    onRadio: () => void;
    onApple: () => void;
    onImportFiles: (files: File[]) => number;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const actions = [
        { icon: Link2, label: t('personal.import'), run: onImport },
        { icon: Radio, label: t('radioAgent.open'), run: onRadio },
        { icon: Music2, label: t('appleMusic.name'), run: onApple },
    ];
    const runAndClose = (action: () => void) => { setOpen(false); action(); };
    return <>
        <aside className="fixed right-[max(12px,env(safe-area-inset-right))] top-[max(12px,env(safe-area-inset-top))] z-[85] hidden max-w-[calc(100vw-24px)] flex-col items-end gap-2 sm:flex">
            <button type="button" aria-label={t('personal.tools')} aria-expanded={open}
                onClick={() => setOpen(value => !value)}
                className="flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-[#17151f]/95 px-4 text-sm text-white shadow-xl backdrop-blur-xl">
                {open ? <X size={18} /> : <AudioLines size={18} />}
                <span>{t('personal.brand')}</span>
            </button>
            {open && <nav aria-label={t('personal.tools')} className="w-56 rounded-2xl border border-white/15 bg-[#17151f]/95 p-2 text-white shadow-2xl backdrop-blur-xl">
                {actions.map(({ icon: Icon, label, run }) => <button key={label} type="button"
                    onClick={() => runAndClose(run)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-200">
                    <Icon size={18} /><span>{label}</span>
                </button>)}
            </nav>}
        </aside>

        <div className="sm:hidden">
            <button type="button" aria-label="打开桐声音乐手机功能" aria-expanded={open}
                onClick={() => setOpen(value => !value)}
                className="fixed right-[max(12px,env(safe-area-inset-right))] top-[max(12px,env(safe-area-inset-top))] z-[131] flex min-h-12 items-center gap-2 rounded-full border border-white/20 bg-[#15141d]/95 px-4 text-sm font-semibold text-white shadow-xl backdrop-blur-xl">
                {open ? <X size={18} /> : <AudioLines size={18} />}
                <span>{open ? '关闭' : '桐声音乐'}</span>
            </button>
            {open && <div className="fixed inset-0 z-[130] flex flex-col overflow-y-auto overscroll-contain bg-[#0c0b11]/98 px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(84px,calc(env(safe-area-inset-top)+72px))] text-white"
                role="dialog" aria-modal="true" aria-label="桐声音乐手机功能">
                <div className="mx-auto w-full max-w-lg space-y-6">
                    <header className="space-y-2">
                        <p className="flex items-center gap-2 text-xs tracking-[0.22em] text-violet-200"><Smartphone size={15}/> TONGSHENG MOBILE</p>
                        <h2 className="text-3xl font-semibold tracking-tight">你的随身音乐空间</h2>
                        <p className="text-sm leading-6 text-white/60">搜索点歌、导入本地歌曲和打开音乐电台。使用 GitHub Pages，无需自己部署服务器。</p>
                    </header>
                    <nav className="grid grid-cols-2 gap-3" aria-label="移动端音乐功能">
                        <button type="button" onClick={() => runAndClose(onImport)}
                            className="flex min-h-36 flex-col items-start justify-between rounded-3xl bg-violet-200 p-5 text-left text-[#16101f] focus-visible:outline-2 focus-visible:outline-white">
                            <Link2 size={25}/><span className="flex w-full items-center justify-between text-lg font-semibold">在线点歌 <ChevronRight size={19}/></span>
                        </button>
                        <label className="relative flex min-h-36 cursor-pointer flex-col items-start justify-between rounded-3xl border border-white/15 bg-white/[0.08] p-5 text-left focus-within:outline-2 focus-within:outline-violet-200">
                            <Upload size={25} className="text-violet-200"/><span className="text-lg font-semibold">本地音乐</span>
                            <input type="file" accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.webm" multiple
                                className="absolute h-px w-px opacity-0"
                                aria-label="从手机选择本地音乐"
                                onChange={event => {
                                    const files = Array.from(event.currentTarget.files ?? []);
                                    if (files.length && onImportFiles(files) > 0) setOpen(false);
                                    event.currentTarget.value = '';
                                }}/>
                        </label>
                        <button type="button" onClick={() => runAndClose(onRadio)}
                            className="flex min-h-32 flex-col items-start justify-between rounded-3xl border border-white/15 bg-white/[0.08] p-5 text-left focus-visible:outline-2 focus-visible:outline-violet-200">
                            <Radio size={25} className="text-violet-200"/><span className="text-lg font-semibold">音乐电台</span>
                        </button>
                        <button type="button" onClick={() => runAndClose(onApple)}
                            className="flex min-h-32 flex-col items-start justify-between rounded-3xl border border-white/15 bg-white/[0.08] p-5 text-left focus-visible:outline-2 focus-visible:outline-violet-200">
                            <Music2 size={25} className="text-violet-200"/><span className="text-lg font-semibold">Apple Music</span>
                        </button>
                    </nav>
                    <section className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                        <p className="text-sm font-medium">像手机 App 一样打开</p>
                        <p className="text-xs leading-6 text-white/60">iPhone：用 Safari 打开网页 → 分享 → 添加到主屏幕。Android：在 Chrome 菜单中选择安装应用或添加到主屏幕。下载的网页资源可离线打开，在线音乐本身仍需要网络。</p>
                    </section>
                </div>
            </div>}
        </div>
    </>;
}

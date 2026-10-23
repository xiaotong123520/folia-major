import type { UnifiedSong } from '../../types';
import { lazy, Suspense, useState } from 'react';
import { AudioLines, Film, LayoutGrid, Link2, Music2, QrCode, Radio, Server, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openLoginWindow } from '../login/loginWindowStore';
import Sheet from '../shared/Sheet';

// One toolbar and the original application surfaces on every viewport; no separate phone homepage.
const HearttraceLibrary = lazy(() => import('./hearttraceLibrary/HearttraceLibrary'));
export default function PersonalMusicTools({ onImport, onRadio, onApple, onVideos, onPlayServerSong, onOpenLibrary }: {
    onOpenLibrary: (tab: 'albums' | 'radio') => void;
    onPlayServerSong: (song: UnifiedSong) => void;
    onImport: () => void;
    onRadio: () => void;
    onApple: () => void;
    onVideos: () => void;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [serverOpen, setServerOpen] = useState(false);
    const actions = [
        { icon: LayoutGrid, label: t('hearttraceLibrary.wall'), run: () => onOpenLibrary('albums') },
        { icon: Radio, label: t('radioAgent.savedWall'), run: () => onOpenLibrary('radio') },
        { icon: Server, label: t('hearttraceLibrary.title'), run: () => setServerOpen(true) },
        { icon: QrCode, label: t('mobileAccess.accounts'), run: () => openLoginWindow() },
        { icon: Link2, label: t('personal.import'), run: onImport },
        { icon: Radio, label: t('radioAgent.open'), run: onRadio },
        { icon: Music2, label: t('appleMusic.name'), run: onApple },
        { icon: Film, label: '我的视频库', run: onVideos },
    ];
    const runAndClose = (action: () => void) => { setOpen(false); action(); };
    return <>
        <aside className="fixed left-[max(12px,env(safe-area-inset-left))] sm:left-auto sm:right-[max(12px,env(safe-area-inset-right))] bottom-[calc(160px+env(safe-area-inset-bottom))] z-[85] flex max-w-[calc(100vw-24px)] flex-col-reverse items-start gap-2 sm:items-end sm:bottom-auto sm:top-[max(12px,env(safe-area-inset-top))] sm:flex-col">
            <button type="button" aria-label={t('personal.tools')} aria-expanded={open}
                onClick={() => setOpen(value => !value)}
                className="flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-[#17151f]/95 px-4 text-sm text-white shadow-xl backdrop-blur-xl">
                {open ? <X size={18} /> : <AudioLines size={18} />}
                <span className="sr-only sm:not-sr-only">{t('personal.brand')}</span>
            </button>
            {open && <nav aria-label={t('personal.tools')} className="w-56 rounded-2xl border border-white/15 bg-[#17151f]/95 p-2 text-white shadow-2xl backdrop-blur-xl">
                {actions.map(({ icon: Icon, label, run }) => <button key={label} type="button"
                    onClick={() => runAndClose(run)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-200">
                    <Icon size={18} /><span>{label}</span>
                </button>)}
            </nav>}
        </aside>

        <Sheet isOpen={serverOpen} onClose={() => setServerOpen(false)} title={t('hearttraceLibrary.title')} closeTip={t('hearttraceLibrary.close')} size="m">
            {serverOpen && <Suspense fallback={<p role="status">{t('hearttraceLibrary.loading')}</p>}>
                <HearttraceLibrary onPlaySong={song => { setServerOpen(false); onPlayServerSong(song); }} />
            </Suspense>}
        </Sheet>
    </>;
}

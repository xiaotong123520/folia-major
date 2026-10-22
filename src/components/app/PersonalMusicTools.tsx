import { useState } from 'react';
import { AudioLines, Link2, Music2, Radio, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// One touch-friendly entry for music imports, radio and official account playback.
export default function PersonalMusicTools({ onImport, onRadio, onApple }: {
    onImport: () => void;
    onRadio: () => void;
    onApple: () => void;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const actions = [
        { icon: Link2, label: t('personal.import'), run: onImport },
        { icon: Radio, label: t('radioAgent.open'), run: onRadio },
        { icon: Music2, label: t('appleMusic.name'), run: onApple },
    ];
    return <aside className="fixed right-[max(12px,env(safe-area-inset-right))] top-[max(12px,env(safe-area-inset-top))] z-[85] flex max-w-[calc(100vw-24px)] flex-col items-end gap-2">
        <button type="button" aria-label={t('personal.tools')} aria-expanded={open}
            onClick={() => setOpen(value => !value)}
            className="flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-[#17151f]/95 px-4 text-sm text-white shadow-xl backdrop-blur-xl">
            {open ? <X size={18} /> : <AudioLines size={18} />}
            <span>{t('personal.brand')}</span>
        </button>
        {open && <nav aria-label={t('personal.tools')} className="w-56 rounded-2xl border border-white/15 bg-[#17151f]/95 p-2 text-white shadow-2xl backdrop-blur-xl">
            {actions.map(({ icon: Icon, label, run }) => <button key={label} type="button"
                onClick={() => { setOpen(false); run(); }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-200">
                <Icon size={18} /><span>{label}</span>
            </button>)}
        </nav>}
    </aside>;
}

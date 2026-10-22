import { ChevronRight, Compass, QrCode, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openLoginWindow } from '../login/loginWindowStore';

// Phone entry points share the existing account controller, settings and full workspace.
export default function MobilePlatformAccess({ compact = false, onOpenWorkspace, onSettings }: {
    compact?: boolean;
    onOpenWorkspace: () => void;
    onSettings: () => void;
}) {
    const { t } = useTranslation();
    if (compact) {
        return <button type="button" onClick={event => openLoginWindow(null, event.currentTarget)}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 px-3 text-xs text-violet-100 focus-visible:outline-2 focus-visible:outline-violet-200">
            <QrCode size={18} aria-hidden="true" />{t('mobileAccess.accounts')}
        </button>;
    }
    return <section aria-label={t('mobileAccess.title')} className="space-y-3">
        <h2 className="text-lg font-semibold">{t('mobileAccess.title')}</h2>
        <button type="button" onClick={event => openLoginWindow(null, event.currentTarget)}
            className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-violet-300/25 bg-violet-300/10 p-4 text-left focus-visible:outline-2 focus-visible:outline-violet-200">
            <QrCode size={23} className="shrink-0 text-violet-200" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('mobileAccess.signIn')}</span><span className="mt-1 block text-xs leading-5 text-white/55">{t('mobileAccess.signInHint')}</span></span>
            <ChevronRight size={19} className="shrink-0" aria-hidden="true" />
        </button>
        <button type="button" onClick={onSettings}
            className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-left focus-visible:outline-2 focus-visible:outline-violet-200">
            <Settings2 size={22} className="shrink-0 text-violet-200" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('mobileAccess.settings')}</span><span className="mt-1 block text-xs leading-5 text-white/55">{t('mobileAccess.settingsHint')}</span></span>
            <ChevronRight size={19} className="shrink-0" aria-hidden="true" />
        </button>
        <button type="button" onClick={onOpenWorkspace}
            className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-left focus-visible:outline-2 focus-visible:outline-violet-200">
            <Compass size={22} className="shrink-0 text-violet-200" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('mobileAccess.workspace')}</span><span className="mt-1 block text-xs leading-5 text-white/55">{t('mobileAccess.workspaceHint')}</span></span>
            <ChevronRight size={19} className="shrink-0" aria-hidden="true" />
        </button>
    </section>;
}

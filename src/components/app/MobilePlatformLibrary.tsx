import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, UserRound, Library, Play, Settings } from 'lucide-react';
import type { LibraryAccountController } from '../../library/core/account/account.contract';
import { useLibraryAccountProviders } from '../../library/core/account/useLibraryAccount';
import { openLoginWindow } from '../login/loginWindowStore';
import type { HomeViewTab } from '../../types';

export type MobileLibraryActions = {
    accountController: LibraryAccountController;
    onLibrary: (tab: HomeViewTab) => void;
    onSearch: (query: string) => void;
    onPlayer: () => void;
    onSettings: () => void;
};

/** Uses the same account controller, login host and library navigation as desktop. */
export default function MobilePlatformLibrary({ accountController, onLibrary, onSearch, onPlayer, onSettings }: MobileLibraryActions) {
    const { t } = useTranslation();
    const { providers, activeProviderId } = useLibraryAccountProviders(accountController);
    const [query, setQuery] = useState('');
    const [error, setError] = useState('');
    return <section aria-label={t('mobileLibrary.platforms')} className="space-y-4">
        <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t('mobileLibrary.platforms')}</h2>
            <button type="button" onClick={() => openLoginWindow()} className="min-h-11 rounded-xl bg-violet-200/15 px-3 text-sm text-violet-100"><UserRound size={17} className="mr-1 inline"/>{t('mobileLibrary.login')}</button>
        </div>
        <p className="text-xs leading-6 text-white/55">{t('mobileLibrary.loginHint')}</p>
        <div className="grid grid-cols-2 gap-3">
            {providers.map(provider => <button key={provider.providerId} type="button"
                aria-pressed={activeProviderId === provider.providerId}
                onClick={async event => {
                    const pressed = event.currentTarget;
                    setError('');
                    try {
                        const result = await accountController.selectProvider(provider.providerId);
                        if (result.action === 'login') openLoginWindow(provider.providerId, pressed);
                        if (result.action === 'unavailable') setError(t('mobileLibrary.unavailable'));
                    } catch { setError(t('mobileLibrary.failed')); }
                }}
                className={`min-h-24 rounded-2xl border p-4 text-left ${activeProviderId === provider.providerId ? 'border-violet-200/60 bg-violet-200/15' : 'border-white/10 bg-white/5'}`}>
                <span className="block truncate text-sm font-semibold">{provider.shortName || provider.displayName}</span>
                <span className="mt-2 block truncate text-xs text-white/55">{!provider.availability.configured ? t('mobileLibrary.unavailable') : provider.user?.nickname || (provider.status === 'authenticated' ? t('mobileLibrary.connected') : t('mobileLibrary.login'))}</span>
            </button>)}
        </div>
        {error && <p role="status" className="text-sm text-amber-200">{error}</p>}
        <form onSubmit={event => { event.preventDefault(); if (query.trim()) onSearch(query.trim()); }} className="flex gap-2">
            <input aria-label={t('mobileLibrary.search')} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('mobileLibrary.search')} className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-base"/>
            <button type="submit" disabled={!query.trim()} aria-label={t('mobileLibrary.search')} className="min-h-12 min-w-12 rounded-xl bg-violet-200 text-black disabled:opacity-40"><Search size={21} className="mx-auto"/></button>
        </form>
        <div className="grid grid-cols-2 gap-2">
            {(['playlist', 'albums', 'explore', 'local'] as const).map(tab => <button key={tab} type="button" onClick={() => onLibrary(tab)} className="flex min-h-12 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm"><Library size={18}/>{t(`mobileLibrary.${tab}`)}</button>)}
            <button type="button" onClick={onPlayer} className="flex min-h-12 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm"><Play size={18}/>{t('mobileLibrary.player')}</button>
            <button type="button" onClick={onSettings} className="flex min-h-12 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm"><Settings size={18}/>{t('mobileLibrary.settings')}</button>
        </div>
    </section>;
}

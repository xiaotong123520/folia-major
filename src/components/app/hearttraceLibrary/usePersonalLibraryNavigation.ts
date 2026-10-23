import { useCallback } from 'react';
import type { LibraryAccountController } from '../../../library/core/account/account.contract';
import { useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';
import { PERSONAL_LIBRARY_PROVIDER } from '../../../services/personalRadioStorage';

// Enter the existing library through its account controller, including its playback switch confirmation.
export function usePersonalLibraryNavigation(account: LibraryAccountController, navigateHome: () => void) {
    return useCallback(async (tab: 'albums' | 'radio') => {
        const choice = await account.selectProvider(PERSONAL_LIBRARY_PROVIDER);
        if (choice.action !== 'switch' || choice.result.status !== 'switched') return;
        useSearchNavigationStore.getState().setHomeViewTab(tab);
        navigateHome();
    }, [account, navigateHome]);
}

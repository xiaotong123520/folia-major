import { describe, expect, it } from 'vitest';
import { canSwitchToProviderDirectly, resolveOnlineProviderAccountView } from '@/library/core/account/onlineProviderAccountView';
import type { ProviderAccountSummary } from '@/types/onlineMusic';

// test/unit/onlineMusic/onlineProviderAccountView.test.ts

const provider = (status: ProviderAccountSummary['status']): ProviderAccountSummary => ({
    providerId: 'netease',
    displayName: 'NetEase Cloud Music',
    shortName: 'NetEase',
    availability: { configured: true },
    status,
    user: null,
    collections: [],
});

// A Folium mod source: no account entry is ever written for it, so it stays unknown and loading.
const accountlessProvider = (): ProviderAccountSummary => ({
    ...provider('unknown'),
    providerId: 'folium.mod-a.source',
    requiresAccount: false,
    hydration: 'loading',
});

describe('online provider account home view', () => {
    it('opens a public catalog without a user while keeping search-only sources accountless', () => {
        const input = { provider: accountlessProvider(), hasUser: false, platformAvailable: true };
        expect(resolveOnlineProviderAccountView(input)).toBe('accountless');
        expect(resolveOnlineProviderAccountView({ ...input, provider: { ...input.provider, publicLibrary: true } })).toBe('public');
    });
    it('shows a neutral resolving state while the account is hydrating', () => {
        expect(resolveOnlineProviderAccountView({
            provider: provider('unknown'),
            hasUser: false,
            platformAvailable: true,
        })).toBe('resolving');
    });

    it('shows the login view only after the account is confirmed anonymous', () => {
        expect(resolveOnlineProviderAccountView({
            provider: provider('anonymous'),
            hasUser: false,
            platformAvailable: true,
        })).toBe('guest');
    });

    it('uses cached user data immediately even while remote validation is pending', () => {
        expect(resolveOnlineProviderAccountView({
            provider: provider('unknown'),
            hasUser: true,
            platformAvailable: true,
        })).toBe('authenticated');
    });

    it('settles a provider without accounts instead of waiting on an account forever', () => {
        expect(resolveOnlineProviderAccountView({
            provider: accountlessProvider(),
            hasUser: false,
            platformAvailable: true,
        })).toBe('accountless');
    });
});

describe('picking a provider', () => {
    it('opens an optional-account public source without requiring a login', () => {
        const publicProvider = { ...provider('anonymous'), requiresAccount: true, publicLibrary: true };
        expect(canSwitchToProviderDirectly(publicProvider)).toBe(true);
        expect(resolveOnlineProviderAccountView({ provider: publicProvider, hasUser: false, platformAvailable: true })).toBe('public');
        expect(resolveOnlineProviderAccountView({ provider: publicProvider, hasUser: true, platformAvailable: true })).toBe('authenticated');
    });
    it('switches directly when signed in or when there is nothing to sign in to', () => {
        expect(canSwitchToProviderDirectly(provider('authenticated'))).toBe(true);
        expect(canSwitchToProviderDirectly(accountlessProvider())).toBe(true);
    });

    it('leaves a provider that needs an account and has none to the sign-in window', () => {
        expect(canSwitchToProviderDirectly(provider('unknown'))).toBe(false);
        expect(canSwitchToProviderDirectly(provider('anonymous'))).toBe(false);
        expect(canSwitchToProviderDirectly({ ...provider('anonymous'), requiresAccount: true })).toBe(false);
    });
});

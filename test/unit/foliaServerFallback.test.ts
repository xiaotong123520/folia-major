import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FOLIA_SERVER_STORAGE_KEY,
    clearFoliaServerBase,
    foliaBackendApiUrl,
    getFoliaServerBase,
    normalizeFoliaServerBase,
    probeFoliaServer,
    saveFoliaServerBase,
} from '../../src/services/foliaServerFallback';

const store = new Map<string, string>();
beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
        electron: undefined,
        localStorage: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => { store.set(key, value); },
            removeItem: (key: string) => { store.delete(key); },
        },
        __FOLIA_RUNTIME_CONFIG__: {},
    });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('static Pages to VPS fallback', () => {
    it('accepts an exact HTTPS gateway origin without paths, queries or passwords', () => {
        expect(normalizeFoliaServerBase('https://music.example.com/')).toBe('https://music.example.com');
        expect(normalizeFoliaServerBase('https://music.example.com/some/path')).toBeNull();
        expect(normalizeFoliaServerBase('https://music.example.com/?token=secret')).toBeNull();
        expect(normalizeFoliaServerBase('https://admin:password@music.example.com')).toBeNull();
        expect(normalizeFoliaServerBase('http://music.example.com')).toBeNull();
        expect(normalizeFoliaServerBase('https://*.example.com')).toBeNull();
    });

    it('persists only public gateway base and derives provider/API routes', () => {
        expect(saveFoliaServerBase('https://music.example.com/')).toBe(true);
        expect(store.get(FOLIA_SERVER_STORAGE_KEY)).toBe('https://music.example.com');
        expect(getFoliaServerBase()).toBe('https://music.example.com');
        expect(foliaBackendApiUrl('/api/lyric-proxy')).toBe('https://music.example.com/api/lyric-proxy');
        clearFoliaServerBase();
        expect(store.has(FOLIA_SERVER_STORAGE_KEY)).toBe(false);
    });

    it('does not accept any HTTP 200 page as a real Folia service', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: true, json: async () => ({ ok: true, service: 'not-folia' }),
        }).mockResolvedValueOnce({
            ok: true, json: async () => ({ ok: true, service: 'folia-web-api' }),
        }));
        expect(await probeFoliaServer('https://music.example.com')).toBe(false);
        expect(await probeFoliaServer('https://music.example.com')).toBe(true);
        expect(vi.mocked(fetch)).toHaveBeenCalledWith('https://music.example.com/api/healthz',
            expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
    });
});

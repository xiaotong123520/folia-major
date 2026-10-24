import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { refreshScript } from '../../../api-ts/cache-refresh';

// Cache recovery must leave authentication, imported audio and unrelated workers alone.
describe('cache recovery', () => {
    it('removes only app resources and keeps account/local music storage untouched', async () => {
        const unregister = vi.fn(async () => true);
        const unrelated = vi.fn(async () => true);
        const remove = vi.fn(async (_name: string) => true);
        const storageClear = vi.fn();
        const databaseDelete = vi.fn();
        const replace = vi.fn();
        const caches = { keys: async () => [
            'workbox-precache-v2-https://music.test/', 'folia-pages', 'folia-lucide-icons',
            'workbox-precache-v2-https://music.test/other/', 'other-data',
        ], delete: remove };
        await runInNewContext(refreshScript, {
            URL, navigator: { serviceWorker: { getRegistrations: async () => [
                { scope: 'https://music.test/', unregister }, { scope: 'https://music.test/other/', unregister: unrelated },
            ] } }, caches, window: { caches },
            document: { getElementById: () => ({ textContent: '' }) },
            location: { href: 'https://music.test/api/cache-refresh', replace },
            localStorage: { clear: storageClear }, indexedDB: { deleteDatabase: databaseDelete },
        });
        expect(unregister).toHaveBeenCalledOnce();
        expect(unrelated).not.toHaveBeenCalled();
        expect(remove.mock.calls.map(call => call[0])).toEqual([
            'workbox-precache-v2-https://music.test/', 'folia-pages', 'folia-lucide-icons',
        ]);
        expect(storageClear).not.toHaveBeenCalled();
        expect(databaseDelete).not.toHaveBeenCalled();
        expect(replace).toHaveBeenCalledWith('/');
    });
});

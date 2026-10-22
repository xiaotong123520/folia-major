import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicBackendClient, MusicBackendHttpError } from '../../src/services/onlineMusic/musicBackendClient';

describe('MusicBackendClient', () => {
    afterEach(() => vi.restoreAllMocks());

    it('rejects remote HTTP endpoints and embedded credentials', () => {
        expect(() => new MusicBackendClient({ baseUrl: 'http://example.com' })).toThrow(MusicBackendHttpError);
        expect(() => new MusicBackendClient({ baseUrl: 'https://user:pass@example.com' })).toThrow(MusicBackendHttpError);
    });

    it('allows localhost HTTP for development', () => {
        expect(() => new MusicBackendClient({ baseUrl: 'http://127.0.0.1:8090' })).not.toThrow();
    });

    it('encodes search query and clamps pagination', async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            expect(url.searchParams.get('q')).toBe('夜空 星空');
            expect(url.searchParams.get('limit')).toBe('50');
            expect(url.searchParams.get('offset')).toBe('0');
            return new Response(JSON.stringify({ code: 200, data: { songs: [] } }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }) as unknown as typeof fetch;
        const client = new MusicBackendClient({ baseUrl: 'https://music.example.com', fetchImpl });
        await client.search(' 夜空 星空 ', 100, -5);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('returns empty results for an empty query without a network request', async () => {
        const fetchImpl = vi.fn() as unknown as typeof fetch;
        const client = new MusicBackendClient({ baseUrl: 'https://music.example.com', fetchImpl });
        await expect(client.search('   ')).resolves.toEqual({ items: [], total: 0 });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('rejects non-OK HTTP responses with a status', async () => {
        const fetchImpl = vi.fn(async () => new Response('no', { status: 429 })) as unknown as typeof fetch;
        const client = new MusicBackendClient({ baseUrl: 'https://music.example.com', fetchImpl });
        await expect(client.getJson('/api/v1/music/search')).rejects.toMatchObject({ status: 429 });
    });

    it('rejects invalid JSON and oversized response bodies', async () => {
        const invalidJsonFetch = vi.fn(async () => new Response('not-json', { status: 200 })) as unknown as typeof fetch;
        const invalidJsonClient = new MusicBackendClient({ baseUrl: 'https://music.example.com', fetchImpl: invalidJsonFetch });
        await expect(invalidJsonClient.getJson('/api/v1/music/search')).rejects.toThrow('invalid JSON');

        const largeFetch = vi.fn(async () => new Response('x'.repeat(2048), { status: 200 })) as unknown as typeof fetch;
        const largeClient = new MusicBackendClient({ baseUrl: 'https://music.example.com', maxResponseBytes: 1024, fetchImpl: largeFetch });
        await expect(largeClient.getJson('/api/v1/music/search')).rejects.toThrow('size limit');
    });

    it('blocks arbitrary and traversal endpoint paths', async () => {
        const client = new MusicBackendClient({ baseUrl: 'https://music.example.com' });
        await expect(client.getJson('https://attacker.example/steal')).rejects.toThrow('Invalid music backend endpoint');
        await expect(client.getJson('/../system/cookies')).rejects.toThrow('Invalid music backend endpoint');
    });

    it('builds a validated public stream URL with encoded parameters', () => {
        const client = new MusicBackendClient({ baseUrl: 'https://music.example.com/root/' });
        const url = new URL(client.getPublicEndpointUrl('/api/v1/music/stream', { id: 'a/b', source: 'netease' }));
        expect(url.origin).toBe('https://music.example.com');
        expect(url.pathname).toBe('/root/api/v1/music/stream');
        expect(url.searchParams.get('id')).toBe('a/b');
        expect(url.searchParams.get('source')).toBe('netease');
    });
});

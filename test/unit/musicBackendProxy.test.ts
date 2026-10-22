import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api-ts/music-backend-proxy';

describe('music backend proxy', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    const request = (path: string, query = '', headers: Record<string, string> = {}) => new Request(
        `https://folia.example/api/music-backend-proxy?path=${encodeURIComponent(path)}${query}`,
        { method: 'GET', headers: { origin: 'https://folia.example', 'x-real-ip': '198.51.100.20', ...headers } },
    );

    it('returns 503 when the upstream is not configured', async () => {
        vi.stubEnv('MUSIC_BACKEND_UPSTREAM_URL', '');
        vi.stubEnv('FOLIA_ALLOWED_ORIGINS', 'https://folia.example');
        const response = await handler(request('/api/v1/music/search', '&q=hello'));
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ code: 'MUSIC_BACKEND_NOT_CONFIGURED' });
    });

    it('rejects administrative and unlisted endpoints', async () => {
        vi.stubEnv('MUSIC_BACKEND_UPSTREAM_URL', 'https://backend.example');
        vi.stubEnv('FOLIA_ALLOWED_ORIGINS', 'https://folia.example');
        const response = await handler(request('/api/v1/system/cookies'));
        expect(response.status).toBe(404);
    });

    it('enforces configured browser origins', async () => {
        vi.stubEnv('MUSIC_BACKEND_UPSTREAM_URL', 'https://backend.example');
        vi.stubEnv('FOLIA_ALLOWED_ORIGINS', 'https://folia.example');
        const response = await handler(request('/api/v1/music/search', '&q=hello', { origin: 'https://evil.example' }));
        expect(response.status).toBe(403);
    });

    it('forwards search to the fixed upstream path and returns JSON', async () => {
        vi.stubEnv('MUSIC_BACKEND_UPSTREAM_URL', 'https://backend.example');
        vi.stubEnv('FOLIA_ALLOWED_ORIGINS', 'https://folia.example');
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            expect(url.origin).toBe('https://backend.example');
            expect(url.pathname).toBe('/api/v1/music/search');
            expect(url.searchParams.get('q')).toBe('hello world');
            return new Response(JSON.stringify({ code: 200, data: { songs: [] } }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchMock);
        const response = await handler(request('/api/v1/music/search', '&q=hello%20world'));
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ data: { songs: [] } });
    });

    it('preserves Range and partial-content headers for stream requests', async () => {
        vi.stubEnv('MUSIC_BACKEND_UPSTREAM_URL', 'https://backend.example');
        vi.stubEnv('FOLIA_ALLOWED_ORIGINS', 'https://folia.example');
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(new Headers(init?.headers).get('range')).toBe('bytes=0-1023');
            return new Response(new Uint8Array([1, 2, 3]), {
                status: 206,
                headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-2/100', 'Accept-Ranges': 'bytes' },
            });
        });
        vi.stubGlobal('fetch', fetchMock);
        const response = await handler(request('/api/v1/music/stream', '&id=123&source=netease', { range: 'bytes=0-1023' }));
        expect(response.status).toBe(206);
        expect(response.headers.get('content-range')).toBe('bytes 0-2/100');
        expect(response.headers.get('accept-ranges')).toBe('bytes');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('rejects unapproved query parameters', async () => {
        vi.stubEnv('MUSIC_BACKEND_UPSTREAM_URL', 'https://backend.example');
        vi.stubEnv('FOLIA_ALLOWED_ORIGINS', 'https://folia.example');
        const response = await handler(request('/api/v1/music/search', '&q=hello&dangerous=1'));
        expect(response.status).toBe(400);
    });
});

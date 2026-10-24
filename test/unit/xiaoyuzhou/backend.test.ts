import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api-ts/podcast';
import { seal, unseal } from '../../../api-ts/xiaoyuzhou/session';

// Exercise anonymous access, login binding and session removal at the HTTP boundary.
function response() {
    const headers = new Map<string, unknown>();
    const res: any = { code: 200, body: null, headersSent: false,
        setHeader: (key: string, value: unknown) => headers.set(key, value), getHeader: (key: string) => headers.get(key),
        status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; }, end() {} };
    return { res, headers };
}
const request = (body: unknown, cookie = '') => ({ method: 'POST', url: '/api/podcast', body,
    headers: { 'content-type': 'application/json', 'x-podcast-request': '1', origin: 'https://music.test', host: 'music.test', cookie } });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('podcast HTTP boundary', () => {
    it('forwards a single audio range without forwarding any account cookie to the CDN', async () => {
        const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
        const fetcher = vi.fn(async (url, init) => String(url).includes('/episode/')
            ? new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { episode: { eid: id, title: 'Range test', enclosure: { url: 'https://media.xyzcdn.net/test.m4a' } } } } })}</script>`)
            : new Response(null, { status: 206, headers: { 'content-type': 'audio/mp4', 'content-range': 'bytes 0-9/100', 'content-length': '10', 'accept-ranges': 'bytes' } }));
        vi.stubGlobal('fetch', fetcher);
        const { res, headers } = response();
        await handler({ method: 'HEAD', url: `/api/podcast?action=audio&id=${id}`, headers: { range: 'bytes=0-9', cookie: 'private-cookie=example' } }, res);
        expect(res.code).toBe(206); expect(headers.get('content-range')).toBe('bytes 0-9/100');
        expect(fetcher.mock.calls[1][1].headers).toEqual({ Range: 'bytes=0-9' });
    });
    it('returns anonymous status without any upstream call or secret', async () => {
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        const { res } = response(); await handler(request({ action: 'status' }), res);
        expect(res.code).toBe(200); expect(res.body).toEqual({ data: null }); expect(fetcher).not.toHaveBeenCalled();
    });
    it('reads a public episode without a session and never leaks the raw audio address', async () => {
        const id = '6021f949a789fca4eff4492c';
        vi.stubGlobal('fetch', vi.fn(async () => new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { episode: { eid: id, title: 'Public episode', duration: 100, enclosure: { url: 'https://media.xyzcdn.net/test.m4a' } } } } })}</script>`)));
        const { res } = response(); await handler(request({ action: 'episode', id }), res);
        expect(res.code).toBe(200); expect(res.body.data.title).toBe('Public episode');
        expect(JSON.stringify(res.body)).not.toContain('test.m4a');
    });
    it('rejects cross-origin requests before touching account operations', async () => {
        const { res } = response(); const req = request({ action: 'logout' }); req.headers.origin = 'https://evil.test';
        await handler(req, res); expect(res.code).toBe(403);
    });
    it('requires the browser-bound QR cookie before polling an arbitrary login key', async () => {
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        const { res } = response(); await handler(request({ action: 'qrCheck', id: 'foreign-key' }), res);
        expect(res.code).toBe(400); expect(fetcher).not.toHaveBeenCalled();
    });
    it('captures confirmed tokens in an encrypted HttpOnly cookie, not JSON', async () => {
        vi.stubEnv('PODCAST_SESSION_SECRET', 'unit-test-only-secret-with-at-least-32-characters');
        const pending = seal({ id: 'test-qr', device: 'test-device' }, 300);
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'CONFIRMED' }, { headers: { 'x-jike-access-token': 'test-access', 'x-jike-refresh-token': 'test-refresh' } })));
        const { res, headers } = response(); await handler(request({ action: 'qrCheck', id: 'test-qr' }, `__Secure-tingyu-podcast-qr=${pending}`), res);
        expect(res.body).toEqual({ data: { state: 'confirmed' } });
        const cookies = headers.get('Set-Cookie') as string[];
        const cookie = cookies.find(value => value.startsWith('__Secure-tingyu-podcast='))!;
        expect(cookie).toContain('HttpOnly; Secure; SameSite=Strict');
        expect(cookie).not.toContain('test-access');
        expect(unseal(cookie.split(';')[0].split('=')[1]).access).toBe('test-access');
    });
    it('deletes both cookies on logout while leaving public access available', async () => {
        const { res, headers } = response(); await handler(request({ action: 'logout' }), res);
        expect(res.code).toBe(200); expect((headers.get('Set-Cookie') as string[]).every(value => value.includes('Max-Age=0'))).toBe(true);
        const next = response(); await handler(request({ action: 'status' }), next.res); expect(next.res.body.data).toBeNull();
    });
});

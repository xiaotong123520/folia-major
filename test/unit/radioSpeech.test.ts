import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api-ts/radio-speech';

// The preview must never charge a paid model or expose the service credential.
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 3)); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const request = (text: unknown = '欢迎收听', extra = {}) => new Request('https://folia.example/api/radio-speech', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, ...extra }),
});
describe('Fish Audio free radio preview', () => {
    it('stops at the verified free-window end without an upstream request', async () => {
        vi.mocked(Date.now).mockReturnValue(Date.UTC(2026, 11, 1));
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        const response = await handler(request());
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'FISH_FREE_UNAVAILABLE' });
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('reports missing configuration without calling Fish', async () => {
        vi.stubEnv('FISH_API_KEY', ''); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        const response = await handler(request());
        expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'FISH_NOT_CONFIGURED' });
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('pins the free model even if a client asks for a paid model or endpoint', async () => {
        vi.stubEnv('FISH_API_KEY', 'test-private-key');
        vi.stubEnv('FISH_REFERENCE_ID', 'my-voice');
        const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([73, 68, 51]), { headers: { 'Content-Type': 'audio/mpeg' } }));
        vi.stubGlobal('fetch', fetcher);
        const response = await handler(request('欢迎', { model: 'drama-3', url: 'https://untrusted.example', reference_id: 'other' }));
        expect(response.status).toBe(200);
        const [url, options] = fetcher.mock.calls[0];
        expect(url).toBe('https://api.fish.audio/v1/tts');
        expect(options.headers.model).toBe('s2.1-pro-free');
        expect(options.headers.Authorization).toBe('Bearer test-private-key');
        expect(JSON.parse(options.body)).toEqual({ text: '欢迎', format: 'mp3', latency: 'normal', reference_id: 'my-voice' });
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(response.headers.get('x-folia-speech-model')).toBe('s2.1-pro-free');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([73, 68, 51]));
    });
    it('does not retry with a paid model when the free model is rejected', async () => {
        vi.stubEnv('FISH_API_KEY', 'test-private-key');
        const fetcher = vi.fn().mockResolvedValue(new Response('private upstream message', { status: 402 })); vi.stubGlobal('fetch', fetcher);
        const response = await handler(request());
        expect(response.status).toBe(502); expect(await response.json()).toEqual({ code: 'FISH_FREE_UNAVAILABLE' });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it.each(['', 'x'.repeat(301), 4, null])('rejects invalid text before upstream requests', async text => {
        const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
        expect((await handler(request(text))).status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
    });
    it('rejects oversized bodies and unrelated origins', async () => {
        expect((await handler(request('valid', { padding: 'x'.repeat(5000) }))).status).toBe(400);
        const input = request(); input.headers.set('Origin', 'https://untrusted.example');
        expect((await handler(input)).status).toBe(403);
    });
    it('handles Pages preflight without invoking speech synthesis', async () => {
        const response = await handler(new Request('https://folia.example/api/radio-speech', { method: 'OPTIONS', headers: { Origin: 'https://xiaotong123520.github.io' } }));
        expect(response.status).toBe(204); expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://xiaotong123520.github.io');
    });
    it('rejects upstream HTML, empty audio and oversized audio', async () => {
        vi.stubEnv('FISH_API_KEY', 'test-private-key');
        for (const upstream of [new Response('<html>error</html>'), new Response('', { headers: { 'Content-Type': 'audio/mpeg' } }), new Response(new Uint8Array(3 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'audio/mpeg' } })]) {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstream));
            const response = await handler(request()); expect(response.status).toBe(502);
            expect(await response.text()).not.toContain('test-private-key');
        }
    });
});

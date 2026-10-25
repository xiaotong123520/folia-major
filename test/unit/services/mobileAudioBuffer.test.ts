import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMobileAudioBuffer } from '@/services/mobileAudioBuffer';

// Whole-file read-ahead must never promote a range fragment or interrupted transfer to a song.
const bytes = new Uint8Array(32 * 1024);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('mobile audio read-ahead', () => {
    it('returns complete audio bytes with the original MIME type', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(bytes.length) } })));
        const blob = await readMobileAudioBuffer('https://audio.example/song');
        expect(blob?.size).toBe(bytes.length);
        expect(blob?.type).toBe('audio/mpeg');
    });

    it.each([
        [206, 'audio/mpeg', String(bytes.length)],
        [200, 'text/html', String(bytes.length)],
        [200, 'audio/mpeg', String(bytes.length + 1)],
        [200, 'audio/mpeg', String(25 * 1024 * 1024)],
        [401, 'application/json', String(bytes.length)],
    ])('refuses partial, error, truncated and oversized responses (%s %s)', async (status, type, length) => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status, headers: { 'Content-Type': type, 'Content-Length': length } })));
        expect(await readMobileAudioBuffer('https://audio.example/song')).toBeNull();
    });

    it('does not begin a stale request or refetch a local object URL', async () => {
        const fetcher = vi.fn();
        vi.stubGlobal('fetch', fetcher);
        expect(await readMobileAudioBuffer('https://audio.example/song', () => false)).toBeNull();
        expect(await readMobileAudioBuffer('blob:cached')).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('bounds chunked downloads even when the server gives no length', async () => {
        const cancel = vi.fn();
        const body = new ReadableStream({
            start(controller) { controller.enqueue(new Uint8Array(24 * 1024 * 1024 + 1)); },
            cancel,
        });
        vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'Content-Type': 'audio/mpeg' } })));
        expect(await readMobileAudioBuffer('https://audio.example/song')).toBeNull();
        expect(cancel).toHaveBeenCalled();
    });

    it('falls back to the stream after CORS or network failure', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network error'); }));
        expect(await readMobileAudioBuffer('https://audio.example/song')).toBeNull();
    });

    it('aborts a stalled download at the time limit', async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        vi.stubGlobal('fetch', vi.fn((_url, options) => {
            signal = options.signal;
            return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
        }));
        const pending = readMobileAudioBuffer('https://audio.example/song');
        await vi.advanceTimersByTimeAsync(30000);
        expect(await pending).toBeNull();
        expect(signal?.aborted).toBe(true);
    });
});

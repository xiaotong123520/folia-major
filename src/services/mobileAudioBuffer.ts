// Bounded whole-file read-ahead for phone playback; never return a partial download as a song.
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_WAIT_MS = 30000;

export const wantsMobileAudioBuffer = (durationMs: number): boolean => (
    typeof window !== 'undefined'
    && !window.electron
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
    && durationMs <= 15 * 60 * 1000
);

export async function readMobileAudioBuffer(url: string, isCurrent = () => true): Promise<Blob | null> {
    if (!/^https:\/\//i.test(url) || !isCurrent()) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAX_WAIT_MS);
    const staleCheck = setInterval(() => { if (!isCurrent()) controller.abort(); }, 200);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
        const response = await fetch(url, { signal: controller.signal });
        const type = response.headers.get('Content-Type') || '';
        // 206 is not a complete file. Text errors, HTML login pages and large lossless files stay streams.
        if (response.status !== 200 || !/^(audio\/|application\/(?:octet-stream|ogg))/i.test(type)) return null;
        const lengthText = response.headers.get('Content-Length');
        const length = lengthText ? Number(lengthText) : null;
        if (length !== null && (!Number.isFinite(length) || length <= 0 || length > MAX_BYTES)) return null;
        if (!response.body) return null;
        reader = response.body.getReader();
        const parts: Uint8Array<ArrayBuffer>[] = [];
        let bytes = 0;
        while (true) {
            const result = await reader.read();
            if (!isCurrent()) return null;
            if (result.done) break;
            bytes += result.value.byteLength;
            if (bytes > MAX_BYTES) return null;
            parts.push(result.value as Uint8Array<ArrayBuffer>);
        }
        const encoded = response.headers.get('Content-Encoding');
        if (bytes < 16 * 1024 || (length !== null && (!encoded || encoded === 'identity') && bytes !== length)) return null;
        return new Blob(parts, { type });
    } catch {
        // CORS restrictions, timeouts or an interrupted request keep the original playable stream.
        return null;
    } finally {
        clearTimeout(timeout);
        clearInterval(staleCheck);
        controller.abort();
        try { await reader?.cancel(); } catch { /* Already aborted or closed. */ }
    }
}

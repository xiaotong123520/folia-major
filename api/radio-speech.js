// Fish Audio radio preview: fixed free model, server-only credentials, bounded MP3 responses.
export const config = { runtime: 'edge' };
const FREE_MODEL = 's2.1-pro-free';
// Official free window currently ends November 30, 2026. Reverify before extending.
const FREE_WINDOW_END = Date.UTC(2026, 11, 1);
async function readBounded(body, limit) {
    if (!body)
        throw new Error('empty');
    const reader = body.getReader();
    const chunks = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > limit) {
                await reader.cancel().catch(() => undefined);
                throw new Error('too-large');
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}
export default async function handler(request) {
    const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    const json = (status, code) => {
        const h = new Headers(headers);
        h.set('Content-Type', 'application/json');
        return new Response(JSON.stringify({ code }), { status, headers: h });
    };
    const origin = request.headers.get('origin');
    const allowed = new Set([new URL(request.url).origin, 'https://xiaotong123520.github.io',
        ...(process.env.FOLIA_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)]);
    if (origin && !allowed.has(origin))
        return json(403, 'ORIGIN_DENIED');
    if (origin) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Vary', 'Origin');
    }
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers });
    if (request.method !== 'POST')
        return json(405, 'METHOD_NOT_ALLOWED');
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
        return json(415, 'JSON_REQUIRED');
    let text;
    try {
        const body = JSON.parse(new TextDecoder().decode(await readBounded(request.body, 4096)));
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 300)
            return json(400, 'INVALID_TEXT');
        text = body.text.trim();
    }
    catch {
        return json(400, 'INVALID_TEXT');
    }
    if (Date.now() >= FREE_WINDOW_END)
        return json(503, 'FISH_FREE_UNAVAILABLE');
    const key = process.env.FISH_API_KEY;
    if (!key)
        return json(503, 'FISH_NOT_CONFIGURED');
    try {
        const reference = process.env.FISH_REFERENCE_ID?.trim();
        const response = await fetch('https://api.fish.audio/v1/tts', {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: FREE_MODEL },
            body: JSON.stringify({ text, format: 'mp3', latency: 'normal', ...(reference ? { reference_id: reference } : {}) }),
        });
        if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 402)
                return json(502, 'FISH_FREE_UNAVAILABLE');
            if (response.status === 429)
                return json(429, 'FISH_BUSY');
            return json(502, 'FISH_FAILED');
        }
        if (!response.headers.get('content-type')?.toLowerCase().startsWith('audio/')) {
            await response.body?.cancel();
            return json(502, 'FISH_FAILED');
        }
        const audio = await readBounded(response.body, 3 * 1024 * 1024);
        if (!audio.length)
            return json(502, 'FISH_FAILED');
        headers.set('Content-Type', 'audio/mpeg');
        headers.set('X-Folia-Speech-Model', FREE_MODEL);
        return new Response(audio, { headers });
    }
    catch {
        return json(502, 'FISH_FAILED');
    }
}

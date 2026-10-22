/**
 * Minimal, defensive HTTP client for a self-hosted music backend.
 *
 * This is transport groundwork only; it is not registered as a Folia provider and does not
 * claim any third-party track is playable. Keep API credentials server-side; browser builds
 * must not receive privileged backend keys.
 */
export interface MusicBackendClientOptions {
    baseUrl: string;
    /** Optional server-side secret. Do not pass a VITE_* value or bundle this into browser code. */
    serverApiKey?: string;
    timeoutMs?: number;
    maxResponseBytes?: number;
    fetchImpl?: typeof fetch;
}

export class MusicBackendHttpError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'MusicBackendHttpError';
    }
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

function normalizeBaseUrl(input: string): URL {
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        throw new MusicBackendHttpError('Music backend base URL is invalid');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new MusicBackendHttpError('Music backend must be an HTTP(S) URL without embedded credentials');
    }
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        throw new MusicBackendHttpError('Remote music backend must use HTTPS');
    }
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url;
}

export class MusicBackendClient {
    private readonly baseUrl: URL;
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;
    private readonly maxResponseBytes: number;

    constructor(private readonly options: MusicBackendClientOptions) {
        this.baseUrl = normalizeBaseUrl(options.baseUrl);
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30_000));
        this.maxResponseBytes = Math.max(1_024, Math.min(options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES, 5_000_000));
    }

    /**
     * Calls a fixed API path, never an arbitrary URL supplied by a song/share link.
     * The endpoint must be a relative path and cannot change the configured origin.
     */
    async getJson<T>(endpoint: string, query: Record<string, string | number | boolean | undefined> = {}, signal?: AbortSignal): Promise<T> {
        if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('..')) {
            throw new MusicBackendHttpError('Invalid music backend endpoint');
        }
        const url = new URL(this.baseUrl.toString());
        url.pathname = `${this.baseUrl.pathname}${endpoint}`.replace(/\/{2,}/g, '/');
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined) url.searchParams.set(key, String(value));
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error('Music backend request timed out')), this.timeoutMs);
        const abortFromCaller = () => controller.abort(signal?.reason);
        if (signal?.aborted) abortFromCaller();
        else signal?.addEventListener('abort', abortFromCaller, { once: true });

        try {
            const headers: Record<string, string> = { Accept: 'application/json' };
            if (this.options.serverApiKey) headers.Authorization = `Bearer ${this.options.serverApiKey}`;
            const response = await this.fetchImpl(url.toString(), {
                method: 'GET',
                headers,
                signal: controller.signal,
                redirect: 'error',
                credentials: 'omit',
            });
            if (!response.ok) {
                throw new MusicBackendHttpError(`Music backend returned HTTP ${response.status}`, response.status);
            }
            const declaredLength = Number(response.headers.get('content-length') || 0);
            if (declaredLength > this.maxResponseBytes) {
                throw new MusicBackendHttpError('Music backend response exceeds the configured size limit');
            }
            if (!response.body) {
                throw new MusicBackendHttpError('Music backend response body is empty');
            }
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let receivedBytes = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    receivedBytes += value.byteLength;
                    if (receivedBytes > this.maxResponseBytes) {
                        await reader.cancel();
                        throw new MusicBackendHttpError('Music backend response exceeds the configured size limit');
                    }
                    chunks.push(value);
                }
            } finally {
                reader.releaseLock();
            }
            const bytes = new Uint8Array(receivedBytes);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
            }
            const text = new TextDecoder().decode(bytes);
            try {
                return JSON.parse(text) as T;
            } catch {
                throw new MusicBackendHttpError('Music backend returned invalid JSON');
            }
        } catch (error) {
            if (error instanceof MusicBackendHttpError) throw error;
            if (controller.signal.aborted) {
                throw new MusicBackendHttpError(signal?.aborted ? 'Music backend request was cancelled' : 'Music backend request timed out');
            }
            throw new MusicBackendHttpError('Music backend request failed');
        } finally {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abortFromCaller);
        }
    }

    getPublicEndpointUrl(endpoint: string, query: Record<string, string | number | boolean | undefined> = {}): string {
        if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('..')) {
            throw new MusicBackendHttpError('Invalid music backend endpoint');
        }
        const url = new URL(this.baseUrl.toString());
        url.pathname = `${this.baseUrl.pathname}${endpoint}`.replace(/\/{2,}/g, '/');
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined) url.searchParams.set(key, String(value));
        }
        return url.toString();
    }

    search(query: string, limit = 20, offset = 0, signal?: AbortSignal): Promise<unknown> {
        const normalizedQuery = query.trim();
        if (!normalizedQuery) return Promise.resolve({ items: [], total: 0 });
        return this.getJson('/api/v1/music/search', {
            q: normalizedQuery,
            limit: Math.max(1, Math.min(Math.floor(limit), 50)),
            offset: Math.max(0, Math.floor(offset)),
        }, signal);
    }

    lyrics(song: { id: string; source: string; name?: string; artist?: string }, signal?: AbortSignal): Promise<unknown> {
        if (!song.id.trim() || !song.source.trim()) {
            throw new MusicBackendHttpError('Song id and source are required for lyric lookup');
        }
        return this.getJson('/api/v1/music/lyric', {
            id: song.id,
            source: song.source,
            name: song.name,
            artist: song.artist,
        }, signal);
    }
}

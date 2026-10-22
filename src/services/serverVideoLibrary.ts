/**
 * GitHub Pages can display remote videos but it cannot receive or store uploads.
 * All writes take place on the separately authenticated Baota PHP admin page.
 * This client makes read-only requests to a single owner-configured HTTPS origin.
 */
export interface ServerVideo {
    id: string;
    title: string;
    mime: string;
    size: number;
    createdAt: string;
}

const VIDEO_ID = /^[a-f0-9]{32}$/;
const MAX_VIDEOS = 200;

export function videoApiBase(raw = import.meta.env.VITE_TONGSHENG_VIDEO_API_URL || ''): URL | null {
    if (!raw || typeof raw !== 'string') return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
        if (url.search || !url.pathname.endsWith('.php')) return null;
        return url;
    } catch { return null; }
}

export function videoStreamUrl(base: URL, id: string): string | null {
    if (!VIDEO_ID.test(id)) return null;
    const url = new URL(base);
    url.searchParams.set('action', 'stream');
    url.searchParams.set('id', id);
    return url.toString();
}

export function adminVideoUrl(base: URL): string {
    const url = new URL(base);
    url.searchParams.set('action', 'admin');
    return url.toString();
}

export async function listServerVideos(
    base: URL,
    fetcher: typeof fetch = fetch,
): Promise<ServerVideo[]> {
    const endpoint = new URL(base);
    endpoint.searchParams.set('action', 'list');
    const res = await fetcher(endpoint.toString(), {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error('video-api-status-' + res.status);
    const length = Number(res.headers.get('content-length') || 0);
    if (length > 1024 * 1024) throw new Error('video-api-result-too-large');
    const result: unknown = await res.json();
    if (!result || typeof result !== 'object') throw new Error('video-api-invalid-body');
    const data = (result as { data?: { videos?: unknown } }).data;
    if (!data || !Array.isArray(data.videos)) throw new Error('video-api-missing-videos');
    return data.videos.slice(0, MAX_VIDEOS).flatMap((row: unknown): ServerVideo[] => {
        if (!row || typeof row !== 'object') return [];
        const item = row as Record<string, unknown>;
        if (typeof item.id !== 'string' || !VIDEO_ID.test(item.id)) return [];
        if (typeof item.title !== 'string' || item.title.length > 150) return [];
        if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(String(item.mime))) return [];
        if (typeof item.size !== 'number' || !Number.isFinite(item.size) || item.size < 0) return [];
        return [{
            id: item.id,
            title: item.title,
            size: item.size,
            mime: String(item.mime),
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
        }];
    });
}

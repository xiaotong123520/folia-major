import type { SongResult, UnifiedSong } from '../../../types';
import { OnlineProviderError, type OnlineMusicProvider } from '../../../types/onlineMusic';
import { parseLRC } from '../../../utils/lyrics/parserCore';
import { catalogSnapshot } from './catalogSnapshot';

// Original server recordings enter the same Omni playback, artwork and lyric pipeline as every source.
export const HEARTTRACE_ORIGIN = new URL('https://我爱南京.com').origin;
// The previous implementation had a single hard-coded preview Vercel relay. Pages is
// static, and that relay may be offline or protected. Try the original owner's public
// per-recording lyric URL first, then a separately configurable HTTPS relay.
const defaultLyricRelay = 'https://folia-major-ai-radio-preview.vercel.app/api/lyric-proxy';
const configuredLyricRelay = String(import.meta.env.VITE_HEARTTRACE_LYRICS_PROXY_URL || '').trim();
const relay = configuredLyricRelay || defaultLyricRelay;
const providerId = 'hearttrace';
type Entry = typeof catalogSnapshot[number];
const identity = (entry: Entry) => `${entry.directory}/${entry.file}`;
const entries = new Map(catalogSnapshot.map(entry => [identity(entry), entry]));

export function toHearttraceSong(entry: Entry): UnifiedSong {
    const id = identity(entry);
    return {
        id, name: entry.title, artists: [], durationMs: 0,
        album: { id: entry.directory, name: entry.album, coverUrl: new URL(entry.cover, HEARTTRACE_ORIGIN).href },
        sourceRef: { kind: 'online', providerId, mediaId: id },
        sourceType: 'cloud',
    };
}

function entryFor(song: SongResult): Entry {
    const ref = song.sourceRef;
    const entry = ref?.kind === 'online' && ref.providerId === providerId ? entries.get(ref.mediaId) : null;
    if (!entry) throw new OnlineProviderError('unsupported', 'Unknown server recording', providerId);
    return entry;
}

/** Never look up lyrics by title: recordings sharing a title can have different words/timing. */
export function hearttraceLyricTarget(entry: Entry): URL {
    const target = new URL('/api/lyrics.php', HEARTTRACE_ORIGIN);
    target.searchParams.set('a', entry.directory);
    target.searchParams.set('n', String(entry.trackNumber));
    return target;
}

function hearttraceLyricRelay(target: URL): URL | null {
    try {
        const url = new URL(relay);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
        url.searchParams.set('url', target.href);
        return url;
    } catch {
        return null;
    }
}

function extractLrcText(raw: string): string | null {
    const text = raw.trim();
    if (!text || text.length > 131072 || /<html|<!doctype|<script/i.test(text)) return null;
    if (!text.startsWith('{')) return text;
    // Owner-hosted endpoints may send {data:{lyric:"[00:00.00]..."}} rather than raw LRC.
    // Inspect documented lyric field names only; never display an error JSON as lyrics.
    try {
        const result: unknown = JSON.parse(text);
        const lyricText = (value: unknown): string | null => {
            if (typeof value === 'string') return value;
            if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
            const row = value as Record<string, unknown>;
            for (const key of ['lyric', 'lyrics', 'lrc', 'text', 'content']) {
                const candidate = row[key];
                if (typeof candidate === 'string') return candidate;
                if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                    const nested = (candidate as Record<string, unknown>).lyric;
                    if (typeof nested === 'string') return nested;
                }
            }
            return null;
        };
        if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
        const body = result as Record<string, unknown>;
        return lyricText(body.data) || lyricText(body);
    } catch {
        return null;
    }
}

function parseTextLyrics(text: string) {
    const lrc = extractLrcText(text);
    if (!lrc || lrc.length > 131072) return null;
    const parsed = parseLRC(lrc);
    return parsed.lines.length > 0 ? { lyrics: parsed, mainText: lrc } : null;
}

/** One URL is the actual owner's lyric endpoint, the second is a CORS relay when needed. */
export async function readHearttraceLyrics(
    entry: Entry,
    fetcher: typeof fetch = fetch,
): Promise<{ lyrics: ReturnType<typeof parseLRC> | null; mainText?: string; isPureMusic: false }> {
    const target = hearttraceLyricTarget(entry);
    const proxy = hearttraceLyricRelay(target);
    const urls = [target, ...(proxy ? [proxy] : [])];
    let absent = false;
    let failure = '';
    for (const endpoint of urls) {
        try {
            const response = await fetcher(endpoint.href, {
                method: 'GET', credentials: 'omit', mode: 'cors',
                signal: AbortSignal.timeout(8000),
                headers: { Accept: 'text/plain, text/lrc;q=0.9' },
            });
            if (response.status === 204 || response.status === 404) {
                absent = true;
                continue;
            }
            if (!response.ok) {
                failure = `HTTP ${response.status}`;
                continue;
            }
            const contentLength = Number(response.headers.get('content-length') || 0);
            if (contentLength > 131072) {
                failure = 'Oversized lyric response';
                continue;
            }
            const rawText = await response.text();
            const parsed = parseTextLyrics(rawText);
            if (parsed) return { ...parsed, isPureMusic: false };
            if (!rawText.trim()) absent = true;
            else failure = 'No valid timed lyrics in response';
        } catch (error) {
            failure = error instanceof Error ? error.name : 'Network unavailable';
        }
    }
    if (absent) return { lyrics: null, isPureMusic: false };
    throw new OnlineProviderError('unavailable', `Original server lyrics unavailable (${failure || 'no readable source'})`, providerId);
}

export const hearttraceProvider: OnlineMusicProvider = {
    id: providerId, displayName: '服务器曲库', shortName: '服务器', mark: { letter: '音', color: '#8b78ca' },
    capabilities: {
        search: true, playback: true, lyrics: true, auth: false, userLibrary: false,
        playlists: false, albums: false, artists: false, recommendations: false,
        mutations: false, wordByWordLyrics: false,
    },
    getAvailability: () => ({ configured: true }),
    normalizeSong(raw) {
        const id = typeof raw === 'string' ? raw : (raw as { id?: string } | null)?.id;
        const entry = id ? entries.get(id) : null;
        if (!entry) throw new OnlineProviderError('unsupported', 'Unknown server recording', providerId);
        return toHearttraceSong(entry);
    },
    search: {
        async searchSongs(query, limit, offset) {
            const keyword = query.trim().toLocaleLowerCase();
            const matches = catalogSnapshot.filter(entry => `${entry.title} ${entry.album}`.toLocaleLowerCase().includes(keyword));
            const items = matches.slice(offset, offset + limit).map(toHearttraceSong);
            return { items, total: matches.length, nextOffset: offset + items.length, hasMore: offset + items.length < matches.length };
        },
    },
    playback: {
        async getSongDetail(id) { const entry = entries.get(String(id)); return entry ? toHearttraceSong(entry) : null; },
        async getAudioSource(song, quality) {
            const entry = entryFor(song);
            const url = new URL('/api/audio.php', HEARTTRACE_ORIGIN);
            url.searchParams.set('path', identity(entry));
            return { url: url.href, quality, fetchedAt: Date.now() };
        },
        getAvailability: () => ({ state: 'unknown' }),
    },
    lyrics: {
        async getLyrics(song) {
            return readHearttraceLyrics(entryFor(song));
        },
    },
};

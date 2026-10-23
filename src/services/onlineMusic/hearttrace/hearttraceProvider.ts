import type { SongResult, UnifiedSong } from '../../../types';
import { OnlineProviderError, type OnlineMusicProvider } from '../../../types/onlineMusic';
import { parseLRC } from '../../../utils/lyrics/parserCore';
import { catalogSnapshot } from './catalogSnapshot';

// Original server recordings enter the same Omni playback, artwork and lyric pipeline as every source.
export const HEARTTRACE_ORIGIN = new URL('https://我爱南京.com').origin;
const relay = 'https://folia-major-ai-radio-preview.vercel.app/api/lyric-proxy';
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
            const entry = entryFor(song);
            const target = new URL('/api/lyrics.php', HEARTTRACE_ORIGIN);
            target.searchParams.set('a', entry.directory);
            target.searchParams.set('n', String(entry.trackNumber));
            const url = new URL(relay);
            url.searchParams.set('url', target.href);
            const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new OnlineProviderError('unavailable', `Server lyrics HTTP ${response.status}`, providerId);
            if (response.status === 204) return { lyrics: null, isPureMusic: false };
            const mainText = await response.text();
            if (mainText.length > 131072 || /<html|<!doctype/i.test(mainText)) throw new OnlineProviderError('unavailable', 'Invalid server lyrics response', providerId);
            return { lyrics: mainText.trim() ? parseLRC(mainText) : null, mainText, isPureMusic: false };
        },
    },
};

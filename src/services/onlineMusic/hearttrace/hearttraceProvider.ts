import type { SongResult, UnifiedSong } from '../../../types';
import { OnlineProviderError, type OnlineMusicProvider, type ProviderCollection } from '../../../types/onlineMusic';
import { parseLRC } from '../../../utils/lyrics/parserCore';
import { catalogSnapshot } from './catalogSnapshot';
import { readSavedRadios } from '../../personalRadioStorage';
import i18n from '../../../i18n/config';

// Original server recordings enter the same Omni playback, artwork and lyric pipeline as every source.
export const HEARTTRACE_ORIGIN = new URL('https://我爱南京.com').origin;
const relay = 'https://folia-major-ai-radio-preview.vercel.app/api/lyric-proxy';
const providerId = 'hearttrace';
type Entry = typeof catalogSnapshot[number];
const identity = (entry: Entry) => `${entry.directory}/${entry.file}`;
const entries = new Map(catalogSnapshot.map(entry => [identity(entry), entry]));
const albumEntries = new Map<string, Entry[]>();
for (const entry of catalogSnapshot) {
    const tracks = albumEntries.get(entry.directory) ?? [];
    tracks.push(entry);
    albumEntries.set(entry.directory, tracks);
}
const albumCollections: ProviderCollection[] = [...albumEntries].map(([directory, tracks]) => ({
    providerId, id: directory, name: tracks[0].album, type: 'album',
    coverUrl: new URL(tracks[0].cover, HEARTTRACE_ORIGIN).href, trackCount: tracks.length,
}));
const pageOf = <T,>(items: T[], limit: number, offset: number) => ({
    items: items.slice(offset, offset + limit), total: items.length,
    nextOffset: Math.min(offset + limit, items.length), hasMore: offset + limit < items.length,
});
const radioCollections = (): ProviderCollection[] => [
    ...readSavedRadios().map(radio => ({
        providerId, id: radio.id, name: radio.name, type: 'playlist',
        coverUrl: radio.songs[0]?.album.coverUrl, trackCount: radio.songs.length, updatedAt: radio.updatedAt,
    })),
    { providerId, id: 'server-radio', name: i18n.t('hearttraceLibrary.defaultRadio'), type: 'playlist',
        coverUrl: albumCollections[0]?.coverUrl, trackCount: catalogSnapshot.length },
];
const radioTracks = (id: string) => id === 'server-radio'
    ? catalogSnapshot.map(toHearttraceSong)
    : readSavedRadios().find(radio => radio.id === id)?.songs ?? [];

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
        search: true, playback: true, lyrics: true, auth: false, userLibrary: true, publicLibrary: true,
        playlists: false, albums: true, userAlbums: true, artists: false, recommendations: true,
        mutations: false, wordByWordLyrics: false,
    },
    getAvailability: () => ({ configured: true }),
    library: {
        async getUserPlaylists() { return pageOf<ProviderCollection>([], 30, 0); },
        async getUserAlbums(_user, limit, offset) { return pageOf(albumCollections, limit, offset); },
    },
    catalog: {
        async getAlbumDetail(id) { return albumCollections.find(album => album.id === id) ?? null; },
        async getAlbumTracks(id, limit = 1000, offset = 0) {
            return pageOf((albumEntries.get(String(id)) ?? []).map(toHearttraceSong), limit, offset);
        },
        async getPlaylistDetail(id) { return radioCollections().find(radio => radio.id === id) ?? null; },
        async getPlaylistTracks(id, limit, offset) {
            const page = pageOf(radioTracks(String(id)), limit, offset);
            // Restore other platforms' playback metadata by exact id, never by a title search or a saved audio URL.
            const { omni } = await import('../omni');
            page.items = await Promise.all(page.items.map(async song => {
                const ref = song.sourceRef;
                if (ref.kind !== 'online' || ref.providerId === providerId) return song;
                try { return await omni.getSongDetail(ref.providerId, ref.mediaId) ?? song; }
                catch { return song; }
            }));
            return page;
        },
    },
    recommendations: {
        async getRecommendedCollections(limit) { return radioCollections().slice(0, limit); },
    },
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

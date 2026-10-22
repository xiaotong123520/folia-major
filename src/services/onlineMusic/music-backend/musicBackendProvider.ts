import type { SongResult, UnifiedSong } from '../../../types';
import {
    OnlineProviderError,
    type AudioQualityPreference,
    type OnlineMusicProvider,
    type ProviderLyricsResult,
    type ProviderSongAvailability,
} from '../../../types/onlineMusic';
import { MusicBackendClient, MusicBackendHttpError } from './musicBackendTransport';

type BackendSong = {
    id?: string | number;
    source?: string;
    name?: string;
    title?: string;
    artist?: string;
    artists?: Array<string | { id?: string | number; name?: string }>;
    album?: string | { id?: string | number; name?: string; cover?: string; coverUrl?: string };
    cover?: string;
    coverUrl?: string;
    pic?: string;
    duration?: number;
    durationMs?: number;
    url?: string;
    extra?: Record<string, unknown>;
    is_vip?: boolean;
    is_invalid?: boolean;
    [key: string]: unknown;
};

type BackendEnvelope<T> = { code?: number; msg?: string; data?: T };
type BackendSearchData = { type?: string; songs?: BackendSong[] };

const providerId = 'music-backend';
const sourceAllowlist = new Set(['netease', 'qq', 'kugou', 'kuwo', 'migu', 'bilibili', 'soda', 'fivesing', 'jamendo', 'joox', 'qianqian']);

const envBaseUrl = (): string => {
    const env = typeof import.meta !== 'undefined' ? (import.meta as ImportMeta & { env?: Record<string, unknown> }).env : undefined;
    const value = env?.VITE_MUSIC_BACKEND_BASE_URL;
    return typeof value === 'string' ? value.trim() : '';
};

const makeClient = (): MusicBackendClient | null => {
    const baseUrl = envBaseUrl();
    if (!baseUrl) return null;
    try {
        return new MusicBackendClient({ baseUrl, timeoutMs: 8000, maxResponseBytes: 1_000_000 });
    } catch {
        return null;
    }
};

const readEnvelope = <T>(raw: unknown): T => {
    if (!raw || typeof raw !== 'object') throw new OnlineProviderError('unavailable', 'Music backend returned an invalid response', providerId);
    const envelope = raw as BackendEnvelope<T>;
    if (typeof envelope.code === 'number' && envelope.code !== 200) {
        throw new OnlineProviderError('unavailable', envelope.msg || 'Music backend request failed', providerId);
    }
    return (envelope.data ?? raw) as T;
};

const toBackendSong = (raw: unknown): BackendSong | null => {
    if (!raw || typeof raw !== 'object') return null;
    const song = raw as BackendSong;
    const id = song.id;
    const name = String(song.name ?? song.title ?? '').trim();
    const source = String(song.source ?? '').trim().toLowerCase();
    if ((typeof id !== 'string' && typeof id !== 'number') || !name || !sourceAllowlist.has(source)) return null;
    return song;
};

const artistsFrom = (song: BackendSong): Array<{ id: string | number; name: string }> => {
    if (Array.isArray(song.artists)) {
        const names = song.artists.map((artist) => typeof artist === 'string'
            ? { id: artist, name: artist }
            : { id: artist?.id ?? artist?.name ?? 'unknown', name: String(artist?.name ?? '').trim() })
            .filter((artist) => artist.name);
        if (names.length) return names;
    }
    return String(song.artist ?? '').split(/\s*[,;/、]\s*/).filter(Boolean).map((name) => ({ id: name, name }));
};

const normalizeBackendSong = (raw: unknown): UnifiedSong => {
    const song = toBackendSong(raw);
    if (!song) throw new OnlineProviderError('unavailable', 'Music backend returned an incomplete song', providerId);
    const source = String(song.source).toLowerCase();
    const id = String(song.id);
    const artists = artistsFrom(song);
    const albumRaw = song.album;
    const albumName = typeof albumRaw === 'string' ? albumRaw : String(albumRaw?.name ?? '');
    const cover = String(song.coverUrl ?? song.cover ?? song.pic ?? (albumRaw && typeof albumRaw === 'object' ? albumRaw.coverUrl ?? albumRaw.cover : '') ?? '');
    const durationMs = Number(song.durationMs ?? (Number(song.duration) > 0 ? Number(song.duration) * 1000 : 0));
    return {
        id: `${source}:${id}`,
        name: String(song.name ?? song.title),
        artists: artists.map((artist) => ({ id: artist.id, name: artist.name, catalogRef: { providerId: source, kind: 'artist' as const, id: artist.id, name: artist.name } })),
        album: {
            id: typeof albumRaw === 'object' && albumRaw?.id !== undefined ? albumRaw.id : albumName || 'unknown',
            name: albumName,
            ...(cover ? { coverUrl: cover } : {}),
        },
        durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0,
        sourceType: 'cloud',
        sourceRef: {
            kind: 'online',
            providerId,
            mediaId: id,
            providerData: { source, backendSongId: id, isVip: Boolean(song.is_vip) },
        },
        ...(song.is_invalid ? { resourceState: false } : {}),
    };
};

const getProviderSong = (song: SongResult): { id: string; source: string; name: string; artist: string; album: string; cover: string } => {
    const ref = song.sourceRef;
    if (!ref || ref.kind !== 'online' || ref.providerId !== providerId) {
        throw new OnlineProviderError('unsupported', 'Song does not belong to the music backend provider', providerId);
    }
    const data = ref.providerData ?? {};
    const source = String(data.source ?? '');
    if (!sourceAllowlist.has(source)) throw new OnlineProviderError('unsupported', 'Unsupported music source', providerId);
    return {
        id: String(data.backendSongId ?? ref.mediaId),
        source,
        name: song.name,
        artist: song.artists.map((artist) => artist.name).join(', '),
        album: song.album.name,
        cover: song.album.coverUrl ?? '',
    };
};

const buildClient = (): MusicBackendClient => {
    const client = makeClient();
    if (!client) throw new OnlineProviderError('unavailable', 'Music backend is not configured. Set VITE_MUSIC_BACKEND_BASE_URL to a secured backend.', providerId);
    return client;
};

export const musicBackendProvider: OnlineMusicProvider = {
    id: providerId,
    displayName: 'Music Backend',
    shortName: 'Backend',
    capabilities: {
        search: true,
        playback: true,
        lyrics: true,
        auth: false,
        userLibrary: false,
        playlists: false,
        albums: false,
        artists: false,
        recommendations: false,
        mutations: false,
        wordByWordLyrics: false,
    },
    getAvailability: () => ({
        configured: Boolean(makeClient()),
        ...(!makeClient() ? { reason: 'not-configured' as const } : {}),
    }),
    normalizeSong: normalizeBackendSong,
    playback: {
        async getSongDetail(id) {
            // The backend has no dedicated song-detail endpoint. Accept only an exact source ID match.
            const inputId = String(id);
            const separator = inputId.indexOf(':');
            const sourceHint = separator > 0 ? inputId.slice(0, separator) : null;
            const rawId = separator > 0 ? inputId.slice(separator + 1) : inputId;
            const result = await musicBackendProvider.search!.searchSongs(rawId, 50, 0);
            const matches = result.items.filter((song) => {
                if (song.sourceRef?.kind !== 'online' || song.sourceRef.mediaId !== rawId) return false;
                return !sourceHint || song.sourceRef.providerData?.source === sourceHint;
            });
            return matches.length === 1 ? matches[0] : null;
        },
        async getAudioSource(song, quality: AudioQualityPreference) {
            const client = buildClient();
            const item = getProviderSong(song);
            const url = client.getPublicEndpointUrl('/api/v1/music/stream', {
                id: item.id, source: item.source, name: item.name, artist: item.artist, album: item.album,
                cover: item.cover,
            });
            return { url, fetchedAt: Date.now(), quality };
        },
        getAvailability(song: SongResult): ProviderSongAvailability {
            if (song.resourceState === false) return { state: 'unavailable', reason: 'taken-down' };
            const ref = song.sourceRef;
            const isVip = ref?.kind === 'online' && ref.providerId === providerId && ref.providerData?.isVip === true;
            if (isVip) return { state: 'unknown', reason: 'restricted', label: '可能需要平台会员权限' };
            return { state: 'unknown' };
        },
    },
    search: {
        async searchSongs(query, limit, offset) {
            const client = buildClient();
            const raw = await client.search(query, limit, offset);
            const data = readEnvelope<BackendSearchData>(raw);
            const songs = Array.isArray(data.songs) ? data.songs : [];
            const items = songs.map(toBackendSong).filter((song): song is BackendSong => Boolean(song)).map(normalizeBackendSong);
            const total = Number((data as BackendSearchData & { total?: number; count?: number }).total
                ?? (data as BackendSearchData & { count?: number }).count ?? items.length);
            return { items, total, hasMore: offset + items.length < total, nextOffset: offset + items.length };
        },
    },
    lyrics: {
        async getLyrics(song): Promise<ProviderLyricsResult> {
            const client = buildClient();
            const item = getProviderSong(song);
            try {
                const raw = await client.lyrics({ id: item.id, source: item.source, name: item.name, artist: item.artist });
                const data = readEnvelope<{ lyric?: string; lyrics?: string }>(raw);
                const mainText = String(data.lyric ?? data.lyrics ?? '').trim();
                return { lyrics: null, mainText: mainText || null, isPureMusic: !mainText };
            } catch (error) {
                if (error instanceof MusicBackendHttpError && error.status === 404) {
                    return { lyrics: null, mainText: null, isPureMusic: false };
                }
                throw error;
            }
        },
    },
};

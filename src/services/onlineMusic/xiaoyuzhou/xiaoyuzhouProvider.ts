import type { UnifiedSong } from '../../../types';
import { OnlineProviderError, type LoginState, type OnlineMusicProvider, type ProviderCollection, type ProviderPage, type ProviderUser } from '../../../types/onlineMusic';
import { createProviderSongMetadata } from '../../../utils/songMetadata';
import { podcastApi, podcastAvailable, requestPodcast } from './xiaoyuzhouTransport';
import { podcastTranscriptLyrics } from './xiaoyuzhouLyrics';

// Public share links and optional account subscriptions normalize into the same Omni source.
type Episode = { id: string; title: string; duration: number; podcastId: string; podcastTitle: string; author: string; cover: string; description?: string };
type Podcast = { id: string; title: string; author: string; cover: string; description: string; count: number };
type Page<T> = { items: T[]; cursor: unknown };
const providerId = 'xiaoyuzhou';
export const normalizePodcastEpisode = (raw: unknown): UnifiedSong => {
    const item = raw as Episode;
    if (!item || !/^[a-f0-9]{24}$/i.test(item.id) || typeof item.title !== 'string') {
        throw new OnlineProviderError('invalid-response', 'Invalid podcast episode', providerId);
    }
    return { id: item.id, name: item.title, artists: [{ id: item.podcastId || item.id, name: item.author || item.podcastTitle || '' }],
        album: { id: item.podcastId || item.id, name: item.podcastTitle || '', coverUrl: item.cover || '' },
        durationMs: Math.max(0, Number(item.duration) || 0) * 1000,
        sourceRef: { kind: 'online', providerId, mediaId: item.id, ...(item.description ? { providerData: { description: item.description } } : {}) } };
};
const collection = (item: Podcast): ProviderCollection => ({ providerId, id: item.id, type: 'playlist', name: item.title,
    coverUrl: item.cover, description: item.description, trackCount: item.count, creator: { id: item.id, nickname: item.author } });
type KeptPage = { items: unknown[]; cursor: unknown; done: boolean; at: number; seen: Set<string> };
const pages = new Map<string, KeptPage>();
const qrImages = new Map<string, string>();
let generation = 0;
const clear = () => { generation += 1; pages.clear(); };
async function paged<T, U>(key: string, action: string, params: Record<string, unknown>, limit: number, offset: number, normalize: (item: T) => U): Promise<ProviderPage<U>> {
    const stamp = generation;
    let kept = pages.get(key);
    if (!kept || Date.now() - kept.at > 300000 || offset === 0) {
        kept = { items: [], cursor: null, done: false, at: Date.now(), seen: new Set() };
        if (pages.size >= 40) pages.delete(pages.keys().next().value!);
        pages.set(key, kept);
    }
    while (!kept.done && kept.items.length < offset + limit) {
        const result = await requestPodcast<Page<T>>(action, { ...params, ...(kept.cursor ? { cursor: kept.cursor } : {}) });
        if (stamp !== generation) throw new OnlineProviderError('unavailable', 'Podcast account changed; please retry', providerId);
        if (!Array.isArray(result.items)) throw new OnlineProviderError('invalid-response', 'Invalid podcast page', providerId);
        const token = JSON.stringify(result.cursor);
        if (result.cursor && (kept.seen.has(token) || result.items.length === 0)) throw new OnlineProviderError('invalid-response', 'Podcast pagination did not advance', providerId);
        kept.items.push(...result.items);
        kept.done = !result.cursor;
        kept.seen.add(token);
        kept.cursor = result.cursor;
        if (kept.items.length >= 2000 && !kept.done) throw new OnlineProviderError('unavailable', 'Podcast list is too large', providerId);
    }
    const items = (kept.items as T[]).slice(offset, offset + limit).map(normalize);
    return { items, nextOffset: offset + items.length, hasMore: !kept.done || offset + items.length < kept.items.length,
        ...(kept.done ? { total: kept.items.length } : {}) };
}
export const xiaoyuzhouProvider: OnlineMusicProvider = {
    id: providerId, displayName: '小宇宙播客', shortName: '小宇宙', mark: { letter: '宇', color: '#ec8542' },
    getAvailability: podcastAvailable,
    capabilities: { search: true, playback: true, lyrics: true, auth: true, userLibrary: true, publicLibrary: true,
        playlists: true, albums: false, artists: false, recommendations: true, mutations: false, wordByWordLyrics: false },
    normalizeSong: normalizePodcastEpisode,
    lyrics: {
        async getLyrics(song) {
            const ref = song.sourceRef;
            if (ref?.kind !== 'online' || ref.providerId !== providerId) throw new OnlineProviderError('unsupported', 'Wrong podcast source', providerId);
            const result = await requestPodcast<{ status: string; segments: Array<{ startMs: number; text: string }> }>('transcript', { id: String(ref.mediaId) });
            return podcastTranscriptLyrics(result.segments);
        },
    },
    songMetadata: { getSongMetadata: createProviderSongMetadata },
    getSongPageUrl: song => song.sourceRef?.kind === 'online' ? `https://www.xiaoyuzhoufm.com/episode/${song.sourceRef.mediaId}` : null,
    search: { searchSongs: (query, limit, offset, context) => paged(`search:${context?.session || ''}:${query}`, 'search', { query }, limit, offset, normalizePodcastEpisode) },
    playback: {
        async getSongDetail(id) { return normalizePodcastEpisode(await requestPodcast('episode', { id: String(id) })); },
        async getAudioSource(song, quality) {
            const ref = song.sourceRef;
            if (ref?.kind !== 'online' || ref.providerId !== providerId) throw new OnlineProviderError('unsupported', 'Wrong podcast source', providerId);
            return { url: `${podcastApi}?action=audio&id=${encodeURIComponent(ref.mediaId)}`, quality, fetchedAt: Date.now() };
        },
        getAvailability: () => ({ state: 'unknown' }),
    },
    catalog: {
        async getPlaylistDetail(id) { return collection(await requestPodcast<Podcast>('podcast', { id: String(id) })); },
        getPlaylistTracks: (id, limit, offset) => paged(`episodes:${id}`, 'episodes', { id: String(id) }, limit, offset, normalizePodcastEpisode),
    },
    recommendations: { async getRecommendedCollections(limit) { return (await requestPodcast<Page<Podcast>>('featured')).items.slice(0, limit).map(collection); } },
    library: {
        getUserPlaylists(userId, limit, offset) {
            return userId === '__public_library__' ? paged('featured', 'featured', {}, limit, offset, collection)
                : paged(`subscriptions:${userId}`, 'subscriptions', {}, limit, offset, collection);
        },
    },
    auth: {
        getLoginTexts: () => ({ title: 'podcast.loginTitle', note: 'podcast.loginNote' }),
        async getLoginStatus() {
            try { return await requestPodcast<ProviderUser | null>('status'); }
            catch (error) { if (error instanceof OnlineProviderError && error.code === 'auth-required') { clear(); return null; } throw error; }
        },
        async logout() { clear(); qrImages.clear(); await requestPodcast('logout'); },
        signInRanOut: clear,
        async startLogin() {
            const result = await requestPodcast<{ key: string; imageUrl: string }>('qrStart');
            if (!result.key || !result.imageUrl?.startsWith('data:image/png;base64,')) throw new OnlineProviderError('invalid-response', 'Invalid podcast QR response', providerId);
            qrImages.clear(); qrImages.set(result.key, result.imageUrl); return result.key;
        },
        async createQr(key) {
            const image = qrImages.get(key);
            if (!image) throw new OnlineProviderError('invalid-response', 'Podcast QR expired', providerId);
            return image;
        },
        async checkLogin(key) {
            const state = await requestPodcast<LoginState>('qrCheck', { id: key });
            if (state.state === 'confirmed') { clear(); qrImages.delete(key); }
            return state;
        },
        async cancelLogin(key) { qrImages.delete(key); await requestPodcast('qrCancel', { id: key }); },
        getLoginTtlMs: () => 300000,
    },
};

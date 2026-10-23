import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedSong } from '../../../src/types';
import type { OnlineMusicProvider } from '../../../src/types/onlineMusic';
import { omni } from '../../../src/services/onlineMusic/omni';
import { registerOnlineMusicProvider, unregisterOnlineMusicProvider } from '../../../src/services/onlineMusic/providerRegistry';

// A saved mixed-source station must resolve exact foreign identities without changing its own tracks.
const owner = 'test-public-library';
const foreign = 'test-foreign-source';
afterEach(() => { unregisterOnlineMusicProvider(owner); unregisterOnlineMusicProvider(foreign); });
const song = (providerId: string): UnifiedSong => ({
    id: 'same-id', name: 'Same title', album: { id: 'album', name: 'Album' }, artists: [], durationMs: 0,
    sourceRef: { kind: 'online', providerId, mediaId: 'same-id' },
});
function provider(id: string): OnlineMusicProvider {
    return { id, displayName: id, normalizeSong: value => value as UnifiedSong,
        capabilities: { search: false, playback: true, lyrics: false, auth: false, userLibrary: false,
            playlists: true, albums: false, artists: false, recommendations: false, mutations: false, wordByWordLyrics: false } };
}
function setup(fail = false) {
    const local = song(owner), kept = song(foreign);
    const detail = vi.fn(async () => {
        if (fail) throw new Error('offline');
        return { ...kept, name: 'Exact foreign recording' };
    });
    registerOnlineMusicProvider({ ...provider(owner), capabilities: { ...provider(owner).capabilities, publicLibrary: true },
        catalog: { getPlaylistTracks: async () => ({ items: [local, kept], nextOffset: 2, hasMore: false, total: 2 }) } });
    registerOnlineMusicProvider({ ...provider(foreign), playback: { getSongDetail: detail, getAudioSource: async () => null } });
    return { local, kept, detail };
}
describe('public mixed-source collections', () => {
    it('hydrates only foreign tracks by original provider and exact id', async () => {
        const { local, detail } = setup();
        const page = await omni.getCollectionTracks({ providerId: owner, id: 'station', name: 'Station', type: 'playlist' }, { limit: 10, offset: 0 });
        expect(page.items[0]).toBe(local);
        expect(page.items[1].name).toBe('Exact foreign recording');
        expect(page.items[1].sourceRef).toMatchObject({ providerId: foreign, mediaId: 'same-id' });
        expect(detail).toHaveBeenCalledWith('same-id');
    });
    it('retains the saved identity when its provider is offline instead of substituting a title match', async () => {
        const { kept } = setup(true);
        const page = await omni.getCollectionTracks({ providerId: owner, id: 'station', name: 'Station', type: 'playlist' }, { limit: 10, offset: 0 });
        expect(page.items[1]).toBe(kept);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findSharedMusicSong } from '../../src/services/musicLinkPlayback';
import { resolveMusicLink } from '../../src/services/musicLinkResolver';

const api = vi.hoisted(() => ({ getSongDetail: vi.fn(), getAudioSource: vi.fn(), getProviderSummaries: vi.fn(), searchProviderSongs: vi.fn() }));
vi.mock('../../src/services/onlineMusic/omni', () => ({ omni: api }));
const link = resolveMusicLink('https://music.163.com/#/song?id=123');

beforeEach(() => {
    vi.resetAllMocks();
    api.getProviderSummaries.mockReturnValue([{ providerId: 'music-backend', availability: { configured: true } }]);
});

describe('same-track server fallback', () => {
    it('uses the original platform when it returns an audio source', async () => {
        const original = { id: '123' };
        api.getSongDetail.mockResolvedValue(original);
        api.getAudioSource.mockResolvedValue({ url: 'https://audio.example/a.mp3' });
        expect(await findSharedMusicSong(link)).toBe(original);
        expect(api.getSongDetail).toHaveBeenCalledTimes(1);
    });

    it('falls back with source and exact ID when the original API fails', async () => {
        const fallback = { id: 'netease:123' };
        api.getSongDetail.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(fallback);
        api.getAudioSource.mockResolvedValue({ url: 'https://server.example/stream' });
        expect(await findSharedMusicSong(link)).toBe(fallback);
        expect(api.getSongDetail).toHaveBeenLastCalledWith('music-backend', 'netease:123');
    });

    it('queries a backend share link and selects only the exact platform and ID', async () => {
        const exact = { id: 'netease:123', sourceRef: { kind: 'online', providerId: 'music-backend', mediaId: 'netease:123' } };
        const wrongPlatform = { id: 'qq:123', sourceRef: { kind: 'online', providerId: 'music-backend', mediaId: 'qq:123' } };
        api.getSongDetail.mockResolvedValue(null);
        api.searchProviderSongs.mockResolvedValue({ items: [wrongPlatform, exact] });
        api.getAudioSource.mockResolvedValue({ url: 'https://server.example/stream' });
        expect(await findSharedMusicSong(link)).toBe(exact);
        expect(api.searchProviderSongs).toHaveBeenCalledWith('music-backend', link.normalizedUrl, { limit: 30, offset: 0 });
    });

    it('rejects same-title results with a different source or ID', async () => {
        api.getSongDetail.mockResolvedValue(null);
        api.searchProviderSongs.mockResolvedValue({ items: [
            { name: 'Same name', sourceRef: { kind: 'online', providerId: 'music-backend', mediaId: 'netease:999' } },
        ] });
        expect(await findSharedMusicSong(link)).toBeNull();
        expect(api.getAudioSource).not.toHaveBeenCalled();
    });

    it('does not query an unconfigured server or guess songs by title', async () => {
        api.getProviderSummaries.mockReturnValue([]);
        api.getSongDetail.mockResolvedValue(null);
        expect(await findSharedMusicSong(link)).toBeNull();
        expect(api.getSongDetail).toHaveBeenCalledTimes(1);
    });

    it('does not send arbitrary URLs or playlists to the server', async () => {
        expect(await findSharedMusicSong(resolveMusicLink('https://private.example/song.mp3'))).toBeNull();
        expect(api.getSongDetail).not.toHaveBeenCalled();
    });
});

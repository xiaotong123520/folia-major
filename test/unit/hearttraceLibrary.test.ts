import { afterEach, describe, expect, it, vi } from 'vitest';
import { hearttraceProvider, HEARTTRACE_ORIGIN, toHearttraceSong } from '../../src/services/onlineMusic/hearttrace/hearttraceProvider';
import { catalogSnapshot } from '../../src/services/onlineMusic/hearttrace/catalogSnapshot';

// Exact recording identities keep artwork and original timestamped lyrics in the main player.
afterEach(() => vi.unstubAllGlobals());
describe('server library in the shared player', () => {
    it('keeps every recording unique and retains all album covers', () => {
        const songs = catalogSnapshot.map(toHearttraceSong);
        expect(new Set(songs.map(song => song.sourceRef?.mediaId)).size).toBe(songs.length);
        expect(songs.every(song => song.album.coverUrl?.startsWith(HEARTTRACE_ORIGIN + '/hearttrace/music/'))).toBe(true);
    });
    it('searches the shared catalog and preserves duplicate titles as different recordings', async () => {
        const page = await hearttraceProvider.search!.searchSongs('兰花草', 30, 0);
        expect(page.items.length).toBeGreaterThan(1);
        expect(new Set(page.items.map(song => song.id)).size).toBe(page.items.length);
    });
    it('uses the exact original file path for audio, without title matching', async () => {
        const entry = catalogSnapshot[0];
        const song = toHearttraceSong(entry);
        const audio = await hearttraceProvider.playback!.getAudioSource(song, 'high');
        expect(new URL(audio!.url).searchParams.get('path')).toBe(`${entry.directory}/${entry.file}`);
        await expect(hearttraceProvider.playback!.getAudioSource({ ...song, sourceRef: { kind: 'online', providerId: 'hearttrace', mediaId: '../other' } }, 'high')).rejects.toThrow();
    });
    it('asks for the original album/track number and parses synchronized lyrics', async () => {
        const fetchMock = vi.fn(async (_url: RequestInfo | URL) => new Response('[00:01.00]Test first line\n[00:03.00]Test second line', { headers: { 'content-type': 'text/plain' } }));
        vi.stubGlobal('fetch', fetchMock);
        const entry = catalogSnapshot[1];
        const lyrics = await hearttraceProvider.lyrics!.getLyrics(toHearttraceSong(entry));
        const relay = new URL(String(fetchMock.mock.calls[0][0]));
        const target = new URL(relay.searchParams.get('url')!);
        expect(target.origin).toBe(HEARTTRACE_ORIGIN);
        expect(target.searchParams.get('a')).toBe(entry.directory);
        expect(target.searchParams.get('n')).toBe(String(entry.trackNumber));
        expect(lyrics.lyrics?.lines.length).toBe(2);
        expect(lyrics.isPureMusic).toBe(false);
    });
    it('does not call a recording instrumental just because it has no lyric file', async () => {
        vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
        const result = await hearttraceProvider.lyrics!.getLyrics(toHearttraceSong(catalogSnapshot[0]));
        expect(result).toEqual({ lyrics: null, isPureMusic: false });
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { hearttraceProvider, HEARTTRACE_ORIGIN, hearttraceLyricTarget, toHearttraceSong } from '../../src/services/onlineMusic/hearttrace/hearttraceProvider';
import { catalogSnapshot } from '../../src/services/onlineMusic/hearttrace/catalogSnapshot';

// Exact recording identities keep artwork and original timestamped lyrics in the main player.
afterEach(() => vi.unstubAllGlobals());
describe('server library in the shared player', () => {
    it('exposes public album cards with complete paginated tracks and the same recording paths', async () => {
        const albums = await hearttraceProvider.library!.getUserAlbums!('__public_library__', 100, 0);
        expect(albums.items).toHaveLength(43);
        const tracks = (await Promise.all(albums.items.map(album => hearttraceProvider.catalog!.getAlbumTracks!(album.id, 1000, 0)))).flatMap(page => page.items);
        expect(tracks).toHaveLength(catalogSnapshot.length);
        expect(new Set(tracks.map(song => song.sourceRef.mediaId)).size).toBe(catalogSnapshot.length);
        const first = albums.items[0];
        const page = await hearttraceProvider.catalog!.getAlbumTracks!(first.id, 2, 0);
        expect(page.items.length).toBeLessThanOrEqual(2);
        expect(page.nextOffset).toBe(page.items.length);
        expect(first.coverUrl).toBe(page.items[0].album.coverUrl);
    });
    it('provides a playable default station without pretending there is a signed-in account', async () => {
        expect(hearttraceProvider.capabilities.auth).toBe(false);
        expect(hearttraceProvider.capabilities.publicLibrary).toBe(true);
        const cards = await hearttraceProvider.recommendations!.getRecommendedCollections!(30);
        const station = cards.find(card => card.id === 'server-radio')!;
        const page = await hearttraceProvider.catalog!.getPlaylistTracks!(station.id, 10, 0);
        expect(page.items).toHaveLength(10);
        expect(page.total).toBe(catalogSnapshot.length);
    });
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
        const target = new URL(String(fetchMock.mock.calls[0][0]));
        expect(target.origin).toBe(HEARTTRACE_ORIGIN);
        expect(target.pathname).toBe('/api/lyrics.php');
        expect(target.searchParams.get('a')).toBe(entry.directory);
        expect(target.searchParams.get('n')).toBe(String(entry.trackNumber));
        expect(lyrics.lyrics?.lines.length).toBe(2);
        expect(lyrics.isPureMusic).toBe(false);
    });
    it('tries the public same-recording lyric endpoint before the relay', async () => {
        const entry = catalogSnapshot[2];
        const urls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            urls.push(url.href);
            if (url.origin === HEARTTRACE_ORIGIN) throw new TypeError('Blocked by CORS');
            return new Response('[00:02.00]Backup lyric line', { headers: { 'content-type': 'text/plain' } });
        }));
        const answer = await hearttraceProvider.lyrics!.getLyrics(toHearttraceSong(entry));
        expect(urls).toHaveLength(2);
        expect(urls[0]).toBe(hearttraceLyricTarget(entry).href);
        const relay = new URL(urls[1]);
        expect(relay.searchParams.get('url')).toBe(urls[0]);
        expect(answer.lyrics?.lines).toHaveLength(1);
    });

    it('ignores proxy JSON and HTML errors rather than displaying them as lyrics', async () => {
        const inputs: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            inputs.push(String(input));
            return new Response('{"error":"not found"}', { headers: { 'content-type': 'application/json' } });
        }));
        await expect(hearttraceProvider.lyrics!.getLyrics(toHearttraceSong(catalogSnapshot[0]))).rejects.toThrow('lyrics unavailable');
        expect(inputs).toHaveLength(2);
    });

    it('parses nested JSON LRC from the owner endpoint without showing raw JSON to the player', async () => {
        const raw = JSON.stringify({ code: 200, data: { lyric: '[00:01.50]第一句\n[00:03.50]第二句' } });
        const mock = vi.fn(async () => new Response(raw, { headers: { 'content-type': 'application/json' } }));
        vi.stubGlobal('fetch', mock);
        const result = await hearttraceProvider.lyrics!.getLyrics(toHearttraceSong(catalogSnapshot[0]));
        expect(mock).toHaveBeenCalledTimes(1);
        expect(result.lyrics?.lines).toHaveLength(2);
        expect(result.mainText).toContain('[00:01.50]');
        expect(result.mainText).not.toContain('"code"');
    });

    it('does not call a recording instrumental just because it has no lyric file', async () => {
        vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
        const result = await hearttraceProvider.lyrics!.getLyrics(toHearttraceSong(catalogSnapshot[0]));
        expect(result).toEqual({ lyrics: null, isPureMusic: false });
    });
});

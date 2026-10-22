import { describe, expect, it } from 'vitest';
import { createPointSongImport, parsePointSongMediaUrl, resolvePointSongMediaUrl } from '../../src/services/directPointSong';

describe('static GitHub Pages point-song sources', () => {
    it('encodes QQ first with the supplied vendor parameters and a fallback', () => {
        const song = createPointSongImport(' 夜空 中最亮的星 ', 'qq-primary');
        expect(song).not.toBeNull();
        const first = new URL(song!.url);
        expect(first.origin).toBe('https://api.lxink.cn');
        expect(first.pathname).toBe('/api-qqmusic/');
        expect(first.searchParams.get('action')).toBe('play');
        expect(first.searchParams.get('type')).toBe('vip');
        expect(first.searchParams.get('songName')).toBe('夜空 中最亮的星');
        expect(song!.fallbackUrls).toHaveLength(1);
        const backup = new URL(song!.fallbackUrls[0]);
        expect(backup.href.startsWith('https://cer.luckying.love/music/Lucky.php?')).toBe(true);
        expect(backup.searchParams.get('Love')).toBe('夜空 中最亮的星');
    });

    it('builds the NetEase endpoint without a different-platform fallback', () => {
        const song = createPointSongImport('晴天', 'netease');
        expect(song).not.toBeNull();
        const endpoint = new URL(song!.url);
        expect(endpoint.origin).toBe('https://cer.luckying.love');
        expect(endpoint.pathname).toBe('/music/LuckyWYY.php');
        expect(endpoint.searchParams.get('Love')).toBe('晴天');
        expect(song!.fallbackUrls).toEqual([]);
    });

    it('offers the QQ backup independently', () => {
        const song = createPointSongImport('海阔天空', 'qq-backup');
        expect(new URL(song!.url).pathname).toBe('/music/Lucky.php');
        expect(song!.fallbackUrls).toEqual([]);
    });

    it('rejects empty or control-character titles and overly long input', () => {
        expect(createPointSongImport(' ', 'qq-primary')).toBeNull();
        expect(createPointSongImport('Hello\nWorld', 'qq-primary')).toBeNull();
        expect(createPointSongImport('x'.repeat(81), 'qq-primary')).toBeNull();
    });
    it('parses CORS-readable nested JSON audio links when supplied by a vendor', async () => {
        const fetchImpl = async () => new Response(JSON.stringify({
            data: { url: 'https://audio.example.com/song.mp3?expires=123' },
        }), { headers: { 'content-type': 'application/json' } });
        await expect(resolvePointSongMediaUrl(
            createPointSongImport('晴天', 'qq-primary')!.url,
            fetchImpl as typeof fetch,
        )).resolves.toBe('https://audio.example.com/song.mp3?expires=123');
    });

    it('refuses unsafe, private and non-browser-playable audio URLs', () => {
        expect(parsePointSongMediaUrl({ data: { url: 'http://127.0.0.1/private' } })).toBeNull();
        expect(parsePointSongMediaUrl({ url: 'javascript:alert(1)' })).toBeNull();
        expect(parsePointSongMediaUrl({ url: 'https://user:secret@example.com/song.mp3' })).toBeNull();
    });

    it('does not parse arbitrary third-party endpoints or HTML', async () => {
        let contacted = false;
        const mock = async () => { contacted = true; return new Response('<html>no audio</html>', { headers: { 'content-type': 'text/html' } }); };
        await expect(resolvePointSongMediaUrl('https://private.example.com/secret', mock as typeof fetch)).resolves.toBeNull();
        expect(contacted).toBe(false);
        await expect(resolvePointSongMediaUrl(createPointSongImport('晴天', 'netease')!.url, mock as typeof fetch)).resolves.toBeNull();
    });

});

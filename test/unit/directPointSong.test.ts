import { describe, expect, it } from 'vitest';
import { createPointSongImport } from '../../src/services/directPointSong';

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
});

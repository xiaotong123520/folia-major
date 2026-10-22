import { describe, expect, it, vi } from 'vitest';
import { adminVideoUrl, listServerVideos, videoApiBase, videoStreamUrl } from '../../src/services/serverVideoLibrary';

const base = videoApiBase('https://video.example.com/index.php')!;

describe('Baota server video library for GitHub Pages', () => {
    it('accepts only explicit HTTPS PHP API and creates bound stream URLs', () => {
        expect(videoApiBase('https://video.example.com/index.php')).not.toBeNull();
        expect(videoApiBase('http://video.example.com/index.php')).toBeNull();
        expect(videoApiBase('https://u:p@video.example.com/index.php')).toBeNull();
        expect(videoApiBase('https://video.example.com/index.php?secret=abc')).toBeNull();
        expect(videoApiBase('https://video.example.com/index.php#token')).toBeNull();
        const id = '0123456789abcdef0123456789abcdef';
        const stream = new URL(videoStreamUrl(base, id)!);
        expect(stream.origin).toBe('https://video.example.com');
        expect(stream.searchParams.get('action')).toBe('stream');
        expect(stream.searchParams.get('id')).toBe(id);
        expect(videoStreamUrl(base, '../../config.php')).toBeNull();
        expect(adminVideoUrl(base)).toBe('https://video.example.com/index.php?action=admin');
    });

    it('lists only known public media metadata without credentials', async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({
            code: 0, data: { videos: [
                { id: '0123456789abcdef0123456789abcdef', title: '第一条视频', mime: 'video/mp4', size: 123456, createdAt: '2026-10-23T00:00:00+00:00' },
                { id: '../unsafe', title: 'Invalid ID', mime: 'video/mp4', size: 20 },
                { id: 'fedcba9876543210fedcba9876543210', title: 'Bad executable', mime: 'application/x-php', size: 12 },
            ] },
        }), { headers: { 'content-type': 'application/json' } }));
        const items = await listServerVideos(base, fetcher as typeof fetch);
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('第一条视频');
        expect(fetcher).toHaveBeenCalledTimes(1);
        const [uri, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(new URL(uri).searchParams.get('action')).toBe('list');
        expect(options.credentials).toBe('omit');
        expect(options.mode).toBe('cors');
    });

    it('rejects malformed API responses', async () => {
        const bad = async () => new Response(JSON.stringify({ code: 0, data: null }), { status: 200 });
        await expect(listServerVideos(base, bad as typeof fetch)).rejects.toThrow('video-api-missing-videos');
    });
});

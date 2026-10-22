import { describe, expect, it } from 'vitest';
import { createHearttraceImport, HEARTTRACE_ORIGIN } from '../../src/components/app/hearttraceLibrary/catalog';
import { catalogSnapshot } from '../../src/components/app/hearttraceLibrary/catalogSnapshot';

// Owner-hosted files retain exact path identity and never become platform-title fallbacks.
describe('hearttrace library', () => {
    it('encodes Unicode, literal percent signs and nested file paths once', () => {
        const entry = { album: '专辑', directory: '电声与管弦乐II', file: '现场/山阴路的夏天 (相信未来版)%20.mp3', title: '山阴路的夏天' };
        const track = createHearttraceImport(entry)!;
        const url = new URL(track.url);
        expect(url.origin).toBe(HEARTTRACE_ORIGIN);
        expect(url.pathname).toBe('/api/audio.php');
        expect(url.searchParams.get('path')).toBe(`${entry.directory}/${entry.file}`);
        expect(track.fallbackUrls).toEqual([]);
    });
    it('rejects traversal and malformed paths', () => {
        for (const file of ['../secret', '/song.mp3', 'a/../song.mp3', 'a\\song.mp3', 'a\nsong.mp3']) {
            expect(createHearttraceImport({ title: 'a', album: 'b', directory: 'c', file })).toBeNull();
        }
    });
    it('has unique exact paths and a usable audio request for every catalog entry', () => {
        expect(catalogSnapshot.length).toBeGreaterThan(0);
        const urls = catalogSnapshot.map(entry => createHearttraceImport(entry)?.url);
        expect(urls.every(Boolean)).toBe(true);
        expect(new Set(urls).size).toBe(urls.length);
    });
});

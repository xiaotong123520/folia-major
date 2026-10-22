import { describe, expect, it } from 'vitest';
import { parseBrief } from '../../api-ts/radio-agent';

describe('Radio Agent brief validation', () => {
    it('bounds strings, removes control characters, and deduplicates search terms', () => {
        const result = parseBrief({
            title: '  Radio\u0000 title  ',
            mood: 'x'.repeat(200),
            genres: ['folk', 1, ' jazz ', ''],
            searchTerms: [' rain ', 'rain', 'x'.repeat(200), null],
            energy: 'high',
            narration: ' hello\u0007 there ',
        }, 'rainy night');

        expect(result.title).toBe('Radio  title');
        expect(result.mood).toHaveLength(100);
        expect(result.genres).toEqual(['folk', 'jazz']);
        expect(result.searchTerms).toEqual(['rain', 'x'.repeat(80)]);
        expect(result.energy).toBe('high');
        expect(result.narration).toBe('hello  there');
    });

    it('falls back for malformed objects and empty model fields', () => {
        const malformed = parseBrief(null, 'rainy night');
        expect(malformed.title).toContain('雨夜');
        const empty = parseBrief({ title: ' ', mood: '', genres: [], searchTerms: [], energy: 'extreme' }, 'focus');
        expect(empty.title).toBe('安静专注电台');
        expect(empty.searchTerms.length).toBeGreaterThan(0);
        expect(empty.energy).toBe('low');
    });
});

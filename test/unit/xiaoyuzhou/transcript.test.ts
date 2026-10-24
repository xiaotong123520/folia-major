import { describe, expect, it } from 'vitest';
import { normalizeTranscript } from '../../../api-ts/xiaoyuzhou/transcript';
import { podcastTranscriptLyrics } from '../../../src/services/onlineMusic/xiaoyuzhou/xiaoyuzhouLyrics';

// Timed text must keep its units and remain distinct from an absent transcript.
describe('podcast timed transcript', () => {
    it('rejects placeholder documents rather than displaying them as real subtitles', () => {
        expect(() => normalizeTranscript([{ startMs: 0, text: '片段' }, { startMs: 1000, text: '......' }, { startMs: 2000, text: '......' }])).toThrow('占位文稿');
    });
    it('sorts valid segments and rejects invalid times and empty text', () => {
        expect(normalizeTranscript([{ startMs: 61020, text: ' 后一句 ' }, { startMs: 1200, text: '第一句' }, { startMs: -1, text: '无效' }, { text: '缺时间' }, { startMs: 0, text: '' }])).toEqual([{ startMs: 1200, text: '第一句' }, { startMs: 61020, text: '后一句' }]);
    });
    it('converts milliseconds to LRC without inventing word timestamps', () => {
        const result = podcastTranscriptLyrics([{ startMs: 61020, text: '这一句\n继续' }]);
        expect(result.mainText).toBe('[01:01.02]这一句 继续');
        expect(result.lyrics?.lines.find(line => line.fullText === '这一句 继续')?.startTime).toBeCloseTo(61.02);
        expect(result.lyrics?.isWordByWord).toBe(false);
        expect(result.lyrics?.lines[0].words).toHaveLength(1);
        expect(result.lyrics?.lines).toHaveLength(1);
    });
    it('returns no lyrics when the upstream has no transcript', () => {
        expect(podcastTranscriptLyrics([]).lyrics).toBeNull();
        expect(() => normalizeTranscript({ text: '简介不是字幕' })).toThrow();
    });
});

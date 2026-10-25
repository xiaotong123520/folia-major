import { describe, expect, it } from 'vitest';
import type { Line } from '@/types';
import { createActiveLineLookup } from '@/utils/lyrics/activeLineLookup';

// Compare against the original reverse scan, including overlapping and unordered imported cues.
const line = (startTime: number, endTime: number, renderEndTime?: number): Line => ({
    startTime, endTime, fullText: 'test', words: [],
    ...(renderEndTime === undefined ? {} : { renderHints: { renderEndTime } as Line['renderHints'] }),
});
const original = (lines: Line[], time: number) => {
    for (let i = lines.length - 1; i >= 0; i--) {
        const row = lines[i];
        if (row && !(time < row.startTime) && time <= (row.renderHints?.renderEndTime ?? row.endTime)) return i;
    }
    return -1;
};

describe('compiled active lyric lookup', () => {
    it('preserves overlapping tails, inclusive boundaries, gaps and reverse seeking', () => {
        const lines = [line(1, 2, 6), line(3, 4), line(3, 5), line(8, 9)];
        const find = createActiveLineLookup(lines);
        for (const time of [0, 1, 2, 3, 4, 5, 5.001, 6, 7, 8, 9, 9.001, 3, 1]) {
            expect(find(time), String(time)).toBe(original(lines, time));
        }
    });

    it('matches the old scan for unsorted, repeated, sparse and invalid cues', () => {
        const lines = [line(3, 7), line(1, 2), line(4, 4), line(NaN, 5), line(0, NaN), line(8, Infinity)];
        delete lines[1];
        const find = createActiveLineLookup(lines);
        for (const time of [-Infinity, -1, 0, 2, 3, 4, 4.001, 5, 7, 8, 100, Infinity, NaN]) {
            expect(find(time), String(time)).toBe(original(lines, time));
        }
        expect(createActiveLineLookup([])(0)).toBe(-1);
    });

    it('matches the original result throughout a long timeline with overlapping tails', () => {
        const lines = Array.from({ length: 4096 }, (_, index) => line(index * 0.5, index * 0.5 + 0.4, index % 17 === 0 ? index * 0.5 + 8 : undefined));
        const find = createActiveLineLookup(lines);
        for (let index = 0; index < 8192; index++) {
            const time = (index * 7919 % 8200) / 4;
            expect(find(time)).toBe(original(lines, time));
        }
    });

    it('does not reread thousands of lyric objects on every animation frame', () => {
        let reads = 0;
        const lines = Array.from({ length: 8192 }, (_, index) => ({
            ...line(index, index + 0.9),
            get startTime() { reads++; return index; },
        }));
        const find = createActiveLineLookup(lines);
        reads = 0;
        for (let frame = 0; frame < 1200; frame++) {
            const second = Math.floor(frame / 120);
            expect(find(second + (frame % 120) / 120 * 0.8)).toBe(second);
        }
        expect(reads).toBe(0);
    });
});

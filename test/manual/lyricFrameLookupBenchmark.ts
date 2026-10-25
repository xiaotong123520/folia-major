import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import type { Line, LyricBackgroundVocal } from '../../src/types';
import { createActiveLineLookup } from '../../src/utils/lyrics/activeLineLookup';
import { createHarmonySnapshotReader, resolveHarmonySnapshotFromVocals } from '../../src/components/visualizer/harmonyRuntime';

// npx tsx test/manual/lyricFrameLookupBenchmark.ts — CPU work only, not a phone/GPU FPS claim.
const frames = Array.from({ length: 12000 }, (_, i) => i / 120);
const lines: Line[] = Array.from({ length: 4096 }, (_, i) => ({ startTime: i / 2, endTime: i / 2 + 0.49, fullText: 'test', words: [] }));
const original = (time: number) => {
    for (let i = lines.length - 1; i >= 0; i--) {
        if (time >= lines[i].startTime && time <= lines[i].endTime) return i;
    }
    return -1;
};
const indexed = createActiveLineLookup(lines);
const vocals: LyricBackgroundVocal[] = Array.from({ length: 1000 }, (_, i) => ({
    text: 'echo now', startTime: i * 0.75, endTime: i * 0.75 + 2,
    words: [{ text: 'echo', startTime: i * 0.75, endTime: i * 0.75 + 0.7 }, { text: 'now', startTime: i * 0.75 + 0.8, endTime: i * 0.75 + 2 }],
}));
const cached = createHarmonySnapshotReader(vocals);
function measure(read: (time: number) => number) {
    const samples: number[] = [];
    let checksum = 0;
    for (let pass = 0; pass < 7; pass++) {
        const start = performance.now();
        let sum = 0;
        for (const time of frames) sum += read(time);
        if (pass > 0) samples.push(performance.now() - start);
        checksum = sum;
    }
    samples.sort((a, b) => a - b);
    return { medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(2)), checksum };
}
const beforeLine = measure(original);
const afterLine = measure(indexed);
const beforeHarmony = measure(time => resolveHarmonySnapshotFromVocals(vocals, time).signature.length);
const afterHarmony = measure(time => cached(time).signature.length);
assert.equal(beforeLine.checksum, afterLine.checksum);
assert.equal(beforeHarmony.checksum, afterHarmony.checksum);
console.log(JSON.stringify({ frames: frames.length, line: { before: beforeLine, after: afterLine }, harmony: { before: beforeHarmony, after: afterHarmony } }, null, 2));

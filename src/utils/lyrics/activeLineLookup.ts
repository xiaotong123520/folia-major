import type { Line } from '../../types';

// Compile one immutable lyric timeline so animation frames do not scan the whole song.
export function createActiveLineLookup(lines: readonly Line[]): (time: number) => number {
    let size = 1;
    while (size < lines.length) size *= 2;
    const starts = new Float64Array(size * 2).fill(Infinity);
    const ends = new Float64Array(size * 2).fill(-Infinity);
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!line) continue;
        const end = line.renderHints?.renderEndTime ?? line.endTime;
        if (Number.isNaN(end)) continue;
        starts[size + index] = Number.isNaN(line.startTime) ? -Infinity : line.startTime;
        ends[size + index] = end;
    }
    for (let node = size - 1; node > 0; node--) {
        starts[node] = Math.min(starts[node * 2], starts[node * 2 + 1]);
        ends[node] = Math.max(ends[node * 2], ends[node * 2 + 1]);
    }
    // Visit the right child first: overlaps and unsorted imports retain the original last-row rule.
    const find = (node: number, time: number): number => {
        if (starts[node] > time || ends[node] < time) return -1;
        if (node >= size) return node - size < lines.length ? node - size : -1;
        const right = find(node * 2 + 1, time);
        return right >= 0 ? right : find(node * 2, time);
    };
    return time => Number.isNaN(time) || lines.length === 0 ? -1 : find(1, time);
}

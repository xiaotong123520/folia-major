import type { LyricData } from '../../../types';

// Preserve supplied timestamps; descriptions and chapter headings never become fabricated lyrics.
export function podcastTranscriptLyrics(segments: Array<{ startMs: number; text: string }>, durationMs?: number) {
    const mainText = segments.map(({ startMs, text }) => {
        const cs = Math.floor(startMs / 10);
        return `[${String(Math.floor(cs / 6000)).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}]${text.replace(/[\r\n]+/g, ' ')}`;
    }).join('\n');
    const lyrics: LyricData | null = segments.length ? {
        isWordByWord: false,
        ttml: { timingMode: 'Line' },
        lines: segments.map((segment, index) => {
            const startTime = segment.startMs / 1000;
            const endTime = Math.max(startTime, (segments[index + 1]?.startMs ?? durationMs ?? segment.startMs + 5000) / 1000);
            const fullText = segment.text.replace(/[\r\n]+/g, ' ');
            return { startTime, endTime, fullText, words: [{ text: fullText, startTime, endTime }] };
        }),
    } : null;
    return { lyrics, mainText, isPureMusic: false as const };
}

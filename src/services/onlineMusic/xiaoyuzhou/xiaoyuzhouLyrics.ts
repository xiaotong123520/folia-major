import { parseLRC } from '../../../utils/lyrics/parserCore';

// Preserve supplied timestamps; descriptions and chapter headings never become fabricated lyrics.
export function podcastTranscriptLyrics(segments: Array<{ startMs: number; text: string }>) {
    const mainText = segments.map(({ startMs, text }) => {
        const cs = Math.floor(startMs / 10);
        return `[${String(Math.floor(cs / 6000)).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}]${text.replace(/[\r\n]+/g, ' ')}`;
    }).join('\n');
    return { lyrics: mainText ? parseLRC(mainText) : null, mainText, isPureMusic: false as const };
}

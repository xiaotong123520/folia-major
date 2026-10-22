import type { PointSongImport } from '../../../services/directPointSong';

// Build owner-hosted audio URLs; this catalog is separate from online platform song identity.
export const HEARTTRACE_ORIGIN = 'https://xn--1lqq7iexp1vp.com';

export type CatalogEntry = { album: string; directory: string; file: string; title: string };

export function createHearttraceImport(entry: CatalogEntry): PointSongImport | null {
    const path = `${entry.directory}/${entry.file}`;
    if (!entry.title.trim() || /[\\\u0000-\u001f\u007f]/.test(path)
        || path.split('/').some(part => !part || part === '.' || part === '..')) return null;
    const url = new URL('/api/audio.php', HEARTTRACE_ORIGIN);
    url.searchParams.set('path', path);
    return { name: `${entry.title} · ${entry.album}`, url: url.href, fallbackUrls: [] };
}

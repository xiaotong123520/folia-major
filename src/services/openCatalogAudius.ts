/**
 * An independent, publicly documented music catalog for static GitHub Pages.
 * It is NOT a replacement stream for an unrelated QQ/NetEase song with the same name.
 * Audius documents read-only search and /tracks/{id}/stream without requiring a
 * privileged bearer token. This browser-only integration never stores credentials.
 */
export interface OpenCatalogTrack {
    id: string;
    title: string;
    artist: string;
}

const AUDIO_API = 'https://api.audius.co/v1';

export function audiusStreamUrl(id: string): string | null {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
    return AUDIO_API + '/tracks/' + encodeURIComponent(id) + '/stream';
}

export async function searchAudiusMusic(
    rawQuery: string,
    fetcher: typeof fetch = fetch,
): Promise<OpenCatalogTrack[]> {
    const query = rawQuery.trim();
    if (!query || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) return [];
    const uri = new URL(AUDIO_API + '/tracks/search');
    uri.searchParams.set('query', query);
    uri.searchParams.set('limit', '12');
    const response = await fetcher(uri.toString(), {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        signal: AbortSignal.timeout(10000),
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Catalog HTTP ' + response.status);
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object') return [];
    const data = (value as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    return data.flatMap((record: unknown) => {
        if (!record || typeof record !== 'object') return [];
        const track = record as Record<string, unknown>;
        if (typeof track.id !== 'string' || !audiusStreamUrl(track.id)) return [];
        if (track.is_streamable === false || track.is_premium === true) return [];
        const title = typeof track.title === 'string' ? track.title.trim().slice(0, 150) : '';
        const user = track.user && typeof track.user === 'object'
            ? (track.user as Record<string, unknown>) : {};
        const artist = typeof user.name === 'string' ? user.name.trim().slice(0, 120) : '';
        if (!title) return [];
        return [{ id: track.id, title, artist }];
    }).slice(0, 12);
}

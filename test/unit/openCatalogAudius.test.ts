import { describe, expect, it, vi } from 'vitest';
import { audiusStreamUrl, searchAudiusMusic } from '../../src/services/openCatalogAudius';

describe('GitHub Pages open music catalog', () => {
    it('searches documented Audius endpoint with read-only, anonymous CORS request', async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({
            data: [
                { id: 'D7KyD', title: 'Open Track', user: { name: 'Public Artist' }, is_streamable: true },
                { id: 'not-streamable', title: 'Locked', is_streamable: false },
                { id: '../unsafe', title: 'Bad ID' },
            ],
        }), { headers: { 'content-type': 'application/json' } }));
        const result = await searchAudiusMusic(' ambient ', fetcher as typeof fetch);
        expect(result).toEqual([{ id: 'D7KyD', title: 'Open Track', artist: 'Public Artist' }]);
        expect(fetcher).toHaveBeenCalledTimes(1);
        const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(new URL(url).pathname).toBe('/v1/tracks/search');
        expect(new URL(url).searchParams.get('query')).toBe('ambient');
        expect(options.credentials).toBe('omit');
        expect(options.mode).toBe('cors');
        expect(audiusStreamUrl('D7KyD')).toBe('https://api.audius.co/v1/tracks/D7KyD/stream');
    });

    it('ignores bad song IDs and empty search terms', async () => {
        expect(audiusStreamUrl('../../internal')).toBeNull();
        expect(audiusStreamUrl('')).toBeNull();
        const fetcher = vi.fn();
        await expect(searchAudiusMusic(' \t ', fetcher as typeof fetch)).resolves.toEqual([]);
        expect(fetcher).not.toHaveBeenCalled();
    });
});

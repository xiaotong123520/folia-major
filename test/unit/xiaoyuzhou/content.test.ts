import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedAudio, episode, extractPage, pageItems, parseLink } from '../../../api-ts/xiaoyuzhou/content';
import { seal, unseal } from '../../../api-ts/xiaoyuzhou/session';
import { normalizePodcastEpisode, xiaoyuzhouProvider } from '../../../src/services/onlineMusic/xiaoyuzhou/xiaoyuzhouProvider';

// Public parsing and account isolation should not depend on a live platform account.
const id = '6021f949a789fca4eff4492c';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('public podcast boundaries', () => {
    it('accepts canonical share links and rejects credentials, lookalikes and arbitrary targets', () => {
        expect(parseLink(`https://www.xiaoyuzhoufm.com/podcast/${id}?source=share`)).toEqual({ kind: 'podcast', id });
        for (const link of [`http://www.xiaoyuzhoufm.com/podcast/${id}`, `https://xiaoyuzhoufm.com.evil.test/podcast/${id}`, `https://user@xiaoyuzhoufm.com/podcast/${id}`, 'https://127.0.0.1/']) expect(parseLink(link)).toBeNull();
        expect(allowedAudio('https://media.xyzcdn.net/audio/a.m4a')?.hostname).toBe('media.xyzcdn.net');
        for (const url of ['https://xyzcdn.net.evil.test/a.mp3', 'http://media.xyzcdn.net/a.mp3', 'https://media.xyzcdn.net:8888/a.mp3', 'https://user@media.xyzcdn.net/a.mp3']) expect(allowedAudio(url)).toBeNull();
    });
    it('extracts SSR data regardless of attribute order and keeps source identity and time units', () => {
        const raw = { eid: id, title: '公开单集', duration: 90, enclosure: { url: 'https://media.xyzcdn.net/a.m4a' }, podcast: { pid: id, title: '节目', author: '作者', image: { largePicUrl: 'https://image.xyzcdn.net/a.jpg' } } };
        const html = `<script type="application/json" id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { episode: raw } } })}</script>`;
        const normalized = normalizePodcastEpisode(episode(extractPage(html).episode));
        expect(normalized.durationMs).toBe(90000);
        expect(normalized.sourceRef).toEqual({ kind: 'online', providerId: 'xiaoyuzhou', mediaId: id });
        expect(normalized.album.coverUrl).toBe('https://image.xyzcdn.net/a.jpg');
        expect(JSON.stringify(normalized)).not.toContain('a.m4a');
        expect(() => extractPage('<html></html>')).toThrow();
    });
    it('keeps cursors in both documented list envelopes and rejects malformed success', () => {
        expect(pageItems({ data: [1], loadMoreKey: 'next' })).toEqual({ items: [1], cursor: 'next' });
        expect(pageItems({ data: { data: [2], loadMoreKey: 'later' } })).toEqual({ items: [2], cursor: 'later' });
        expect(() => pageItems({ data: {} })).toThrow();
    });
});
describe('optional account session', () => {
    it('authenticates encrypted cookies and rejects tampering and expiry', () => {
        vi.stubEnv('PODCAST_SESSION_SECRET', 'unit-test-only-secret-with-at-least-32-characters');
        vi.useFakeTimers();
        const packed = seal({ access: 'test-only-token' }, 10);
        expect(packed).not.toContain('test-only-token');
        expect(unseal(packed)).toEqual({ access: 'test-only-token' });
        expect(unseal(packed.slice(0, 10) + 'x' + packed.slice(11))).toBeNull();
        vi.advanceTimersByTime(11000);
        expect(unseal(packed)).toBeNull();
    });
    it('reads public collections without making account or login requests', async () => {
        const actions: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
            actions.push(JSON.parse(init.body).action);
            return Response.json({ data: { items: [{ id, title: '公开节目', author: '作者', count: 2 }], cursor: null } });
        }));
        const result = await xiaoyuzhouProvider.library!.getUserPlaylists!('__public_library__', 30, 0);
        expect(result.items[0].name).toBe('公开节目');
        expect(actions).toEqual(['featured']);
    });
    it('keeps public episode links independent of the optional login', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
            const body = JSON.parse(init.body);
            expect(body.action).toBe('search');
            return Response.json({ data: { items: [{ id, title: '单集', duration: 120 }], cursor: null } });
        }));
        const page = await xiaoyuzhouProvider.search!.searchSongs(`https://www.xiaoyuzhoufm.com/episode/${id}`, 30, 0);
        expect(page.items[0].name).toBe('单集');
    });
});

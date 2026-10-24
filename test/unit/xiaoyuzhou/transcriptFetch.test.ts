import { afterEach, expect, it, vi } from 'vitest';
const account = vi.hoisted(() => vi.fn());
vi.mock('../../../api-ts/xiaoyuzhou/account.js', () => ({
    accountFetch: account,
    PodcastError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
import { readTranscript } from '../../../api-ts/xiaoyuzhou/transcript';

// Native transcript media ids differ from playback ids on RSS-bridged shows.
afterEach(() => { account.mockReset(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('honors the explicit transcript off switch', async () => {
    vi.stubEnv('PODCAST_TRANSCRIPT_VERIFIED', 'false');
    await expect(readTranscript({}, {}, '6021f949a789fca4eff4492c')).rejects.toThrow('尚未通过内容核对');
    expect(account).not.toHaveBeenCalled();
});
it('uses the native transcript id and never forwards account credentials to the CDN', async () => {
    account.mockResolvedValueOnce({ data: { eid: '6021f949a789fca4eff4492c', transcriptMediaId: 'native', media: { id: 'external' } } })
        .mockResolvedValueOnce({ data: { transcriptUrl: 'https://media.xyzcdn.net/transcript.json?signature=test' } });
    const fetcher = vi.fn(async (_input: unknown, _init?: RequestInit) => Response.json([{ startMs: 1000, text: '句子' }]));
    vi.stubGlobal('fetch', fetcher);
    const req = { headers: { cookie: 'never-forward-this' } };
    const result = await readTranscript(req, {}, '6021f949a789fca4eff4492c');
    expect(account.mock.calls[1][3]).toEqual({ eid: '6021f949a789fca4eff4492c', mediaId: 'native' });
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ 'User-Agent': 'Xiaoyuzhou/2.99.1(android 28)' });
    expect(result).toEqual({ status: 'available', segments: [{ startMs: 1000, text: '句子' }] });
    expect(JSON.stringify(result)).not.toContain('signature');
});
it('returns missing without fetching an invented subtitle URL', async () => {
    account.mockResolvedValueOnce({ data: { eid: '6021f949a789fca4eff4492c', transcriptMediaId: 'media' } }).mockResolvedValueOnce({ data: {} });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await readTranscript({}, {}, '6021f949a789fca4eff4492c')).toEqual({ status: 'missing', segments: [] });
    expect(fetcher).not.toHaveBeenCalled();
});
it('rejects an unrecognized transcript host before making any request', async () => {
    account.mockResolvedValueOnce({ data: { eid: '6021f949a789fca4eff4492c', transcriptMediaId: 'media' } }).mockResolvedValueOnce({ data: { transcriptUrl: 'https://127.0.0.1/private' } });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(readTranscript({}, {}, '6021f949a789fca4eff4492c')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
});

it('rejects a mismatched episode before requesting its transcript', async () => {
    account.mockResolvedValueOnce({ data: { eid: '000000000000000000000000', transcriptMediaId: 'native' } });
    await expect(readTranscript({}, {}, '6021f949a789fca4eff4492c')).rejects.toThrow('身份不匹配');
    expect(account).toHaveBeenCalledTimes(1);
});

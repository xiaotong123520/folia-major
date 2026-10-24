import { accountFetch, PodcastError } from './account.js';
import { allowedAudio, ID } from './content.js';

// Read upstream timed text without exposing signed transcript URLs or account credentials.
export function normalizeTranscript(raw: unknown) {
    if (!Array.isArray(raw)) throw new PodcastError(502, '字幕格式暂不支持');
    return raw.flatMap(item => {
        const startMs = Number(item?.startMs);
        const text = typeof item?.text === 'string' ? item.text.trim() : '';
        return Number.isFinite(startMs) && startMs >= 0 && text ? [{ startMs, text }] : [];
    }).sort((a, b) => a.startMs - b.startMs);
}
export async function readTranscript(req: any, res: any, id: string) {
    if (!ID.test(id)) throw new PodcastError(400, '无效单集');
    const detail = await accountFetch(req, res, '/v1/episode/get?eid=' + id);
    const ep = detail?.data;
    const mediaId = ep?.transcriptMediaId || ep?.transcript?.mediaId || ep?.media?.id;
    if (!mediaId) return { status: 'missing', segments: [] };
    const response = await accountFetch(req, res, '/v1/episode-transcript/get', { eid: id, mediaId });
    const data = response?.data?.data || response?.data;
    if (!data?.transcriptUrl) return { status: 'missing', segments: [] };
    const url = allowedAudio(data.transcriptUrl);
    if (!url) throw new PodcastError(502, '字幕来源暂不支持');
    const result = await fetch(url, { redirect: 'error', headers: { 'User-Agent': 'Xiaoyuzhou/2.99.1(android 28)' }, signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw new PodcastError(502, `字幕读取失败（HTTP ${result.status}）`);
    const text = await result.text();
    if (text.length > 3000000) throw new PodcastError(502, '字幕过大');
    const segments = normalizeTranscript(JSON.parse(text));
    return { status: segments.length ? 'available' : 'missing', segments };
}

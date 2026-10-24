import { accountFetch, PodcastError } from './account.js';
import { allowedAudio, ID, publicPage } from './content.js';

// Read upstream timed text without exposing signed transcript URLs or account credentials.
export function normalizeTranscript(raw: unknown) {
    if (!Array.isArray(raw)) throw new PodcastError(502, '字幕格式暂不支持');
    const segments = raw.flatMap(item => {
        const startMs = Number(item?.startMs);
        const text = typeof item?.text === 'string' ? item.text.trim() : '';
        return Number.isFinite(startMs) && startMs >= 0 && text ? [{ startMs, text }] : [];
    }).sort((a, b) => a.startMs - b.startMs);
    // Repeated ellipsis entries are a partial/placeholder document, not a usable timed transcript.
    const placeholders = segments.filter(item => /^[.。…\s]+$/.test(item.text)).length;
    if (placeholders >= 2 && placeholders / segments.length >= 0.2) {
        throw new PodcastError(502, '平台返回了片段或占位文稿，暂不能作为同步字幕；可先查看下方简介与章节');
    }
    return segments;
}
export async function readTranscript(req: any, res: any, id: string, probe = false) {
    if (!ID.test(id)) throw new PodcastError(400, '无效单集');
    // Live samples failed content verification. Do not distribute them as subtitles until verified.
    if (!probe && process.env.PODCAST_TRANSCRIPT_VERIFIED !== 'true') {
        throw new PodcastError(503, '平台文稿尚未通过内容核对，暂不显示同步字幕；下方可查看节目简介与章节');
    }
    const detail = await accountFetch(req, res, '/v1/episode/get?eid=' + id);
    const ep = detail?.data;
    if (ep?.eid !== id) throw new PodcastError(502, '文稿单集身份不匹配，已停止读取');
    const page = probe ? (await publicPage('episode', id)).episode : null;
    if (page && page.eid !== id) throw new PodcastError(502, '分享页单集身份不匹配');
    const mediaId = page?.transcriptMediaId || page?.transcript?.mediaId || ep?.transcriptMediaId || ep?.transcript?.mediaId;
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
    if (probe) return { status: 'unverified', episodeId: id, title: ep.title,
        publicNativeIdFound: Boolean(page?.transcriptMediaId || page?.transcript?.mediaId),
        nativeIdsAgree: !page?.transcriptMediaId || page.transcriptMediaId === ep?.transcriptMediaId,
        segmentCount: segments.length, firstStartMs: segments[0]?.startMs,
        lastStartMs: segments.at(-1)?.startMs, firstText: segments[0]?.text?.slice(0, 240) };
    return { status: segments.length ? 'available' : 'missing', segments };
}

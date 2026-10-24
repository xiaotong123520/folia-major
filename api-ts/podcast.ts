import qr from 'qrcode';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ID, PUBLIC_IDS, allowedAudio, episode, pageItems, parseLink, podcast, publicPage } from './xiaoyuzhou/content.js';
import { PodcastError, accountFetch, newDevice, qrCheck, qrCreate } from './xiaoyuzhou/account.js';
import { readCookie, setCookie } from './xiaoyuzhou/session.js';

// One same-origin podcast backend combines public browsing and optional HttpOnly account access.
const publicCache = new Map<string, { expires: number; value: any }>();
async function readPublic(kind: string, id: string) {
    const key = kind + ':' + id;
    const kept = publicCache.get(key);
    if (kept && kept.expires > Date.now()) return kept.value;
    const value = await publicPage(kind, id);
    if (publicCache.size >= 100) publicCache.delete(publicCache.keys().next().value!);
    publicCache.set(key, { value, expires: Date.now() + 300000 });
    return value;
}
const cleanEpisode = (value: ReturnType<typeof episode>) => { const { audio, private: _private, ...safe } = value; return safe; };
const validId = (id: unknown): string => {
    if (typeof id !== 'string' || !ID.test(id)) throw new PodcastError(400, '无效的播客链接');
    return id;
};
async function featured() {
    const results = await Promise.allSettled(PUBLIC_IDS.map(async id => podcast((await readPublic('podcast', id)).podcast)));
    const items = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (!items.length) throw new PodcastError(502, '暂时无法读取公开播客，请稍后重试');
    return { items, cursor: null };
}
async function audio(req: any, res: any, id: string) {
    let value = episode((await readPublic('episode', validId(id))).episode);
    if ((!value.audio || value.private) && readCookie(req)?.access) {
        const data = await accountFetch(req, res, '/v1/private-media/get?eid=' + id + '&dubbing=false');
        value = { ...value, audio: data?.data?.url || '' };
    }
    const target = allowedAudio(value.audio);
    if (!target) throw new PodcastError(403, '该单集暂无可播放的音频，可能需要登录或在小宇宙内购买');
    const range = req.headers.range;
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new PodcastError(416, '无效的音频范围');
    const upstream = await fetch(target, { method: req.method, redirect: 'error',
        headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(60000) });
    if (upstream.status === 416) { res.status(416).end(); return; }
    if (![200, 206].includes(upstream.status)) throw new PodcastError(502, '音频服务暂不可用');
    const type = upstream.headers.get('content-type') || '';
    if (!/^(audio\/|application\/octet-stream)/i.test(type)) throw new PodcastError(502, '服务未返回有效音频');
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(header); if (value) res.setHeader(header, value);
    }
    res.status(upstream.status);
    if (req.method === 'HEAD' || !upstream.body) { res.end(); return; }
    await pipeline(Readable.fromWeb(upstream.body as any), res);
}
export default async function handler(req: any, res: any) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
        const url = new URL(req.url || '/', 'https://localhost');
        if (url.searchParams.get('action') === 'audio' && ['GET', 'HEAD'].includes(req.method)) {
            return await audio(req, res, url.searchParams.get('id') || '');
        }
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
        if (req.headers['x-podcast-request'] !== '1' || !String(req.headers['content-type']).startsWith('application/json')) throw new PodcastError(403, '请求来源无效');
        const origin = req.headers.origin;
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        if (origin && new URL(origin).host !== host) throw new PodcastError(403, '请求来源无效');
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
        if (JSON.stringify(body).length > 8192) throw new PodcastError(400, '请求过长');
        const { action, id, query, cursor } = body;
        let result: any;
        switch (action) {
            case 'featured': result = await featured(); break;
            case 'status': {
                if (!readCookie(req)?.access) { result = null; break; }
                const data = await accountFetch(req, res, '/web/user/get-me', undefined, true);
                if (!data?.data?.uid) throw new PodcastError(502, '无法读取账户信息');
                result = { id: data.data.uid, nickname: data.data.nickname || '', avatarUrl: data.data.avatarUrl || '' }; break;
            }
            case 'qrStart': {
                const value = await qrCreate();
                setCookie(res, { id: value.id, device: newDevice() }, true);
                result = { key: value.id, imageUrl: await qr.toDataURL(value.url, { width: 320, margin: 2 }) }; break;
            }
            case 'qrCheck': result = await qrCheck(req, res, String(id || '')); break;
            case 'qrCancel': if (readCookie(req, true)?.id === id) setCookie(res, null, true); result = {}; break;
            case 'logout': setCookie(res, null); setCookie(res, null, true); result = {}; break;
            case 'subscriptions': {
                const data = await accountFetch(req, res, '/v1/subscription/list', { sortBy: 'subscribedAt', ...(cursor ? { loadMoreKey: cursor } : {}) });
                const page = pageItems(data); result = { items: page.items.map(podcast), cursor: page.cursor }; break;
            }
            case 'podcast': result = podcast((await readPublic('podcast', validId(id))).podcast); break;
            case 'episode': result = cleanEpisode(episode((await readPublic('episode', validId(id))).episode)); break;
            case 'episodes': {
                validId(id);
                if (readCookie(req)?.access) {
                    try {
                        const data = await accountFetch(req, res, '/v1/episode/list', { pid: id, order: 'desc', ...(cursor ? { loadMoreKey: cursor } : {}) });
                        const page = pageItems(data);
                        const parent = (await readPublic('podcast', id)).podcast;
                        result = { items: page.items.map(raw => cleanEpisode(episode(raw, parent))), cursor: page.cursor }; break;
                    } catch (error) {
                        // An expired account must not block the public first page; later pages cannot be invented.
                        if (!(error instanceof PodcastError) || error.status !== 401 || cursor) throw error;
                    }
                }
                const raw = (await readPublic('podcast', id)).podcast;
                result = { items: (raw.episodes || []).map((item: any) => cleanEpisode(episode(item, raw))), cursor: null }; break;
            }
            case 'search': {
                if (typeof query !== 'string' || query.length > 512 || !query.trim()) throw new PodcastError(400, '请输入节目名称或完整小宇宙分享链接');
                const link = parseLink(query.trim());
                if (link) {
                    const raw = await readPublic(link.kind, link.id);
                    result = { items: link.kind === 'episode' ? [cleanEpisode(episode(raw.episode))]
                        : (raw.podcast.episodes || []).map((item: any) => cleanEpisode(episode(item, raw.podcast))), cursor: null }; break;
                }
                if (!readCookie(req)?.access) throw new PodcastError(401, '免登录请粘贴完整小宇宙节目或单集链接；全站关键词搜索需要登录');
                const data = await accountFetch(req, res, '/v1/search/create', { keyword: query.trim(), type: 'EPISODE', ...(cursor ? { loadMoreKey: cursor } : {}) });
                const page = pageItems(data);
                result = { items: page.items.filter(item => item.type === 'EPISODE').map(raw => cleanEpisode(episode(raw))), cursor: page.cursor }; break;
            }
            default: throw new PodcastError(400, '不支持的播客操作');
        }
        return res.status(200).json({ data: result });
    } catch (error) {
        if (res.headersSent) { res.destroy(); return; }
        const status = error instanceof PodcastError ? error.status : 502;
        return res.status(status).json({ error: error instanceof PodcastError ? error.message : '播客服务暂时无法连接，请稍后重试' });
    }
}

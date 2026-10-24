import { randomUUID } from 'node:crypto';
import { readCookie, setCookie } from './session.js';
import { UA } from './content.js';

// Optional account access uses fixed API operations; public content never requires a session.
const API = 'https://api.xiaoyuzhoufm.com';
const WEB_API = 'https://web-api.xiaoyuzhoufm.com';
export class PodcastError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const webHeaders = () => ({ 'Content-Type': 'application/json;charset=UTF-8', 'User-Agent': UA,
    Origin: 'https://accounts.xiaoyuzhoufm.com', Referer: 'https://accounts.xiaoyuzhoufm.com/',
    'x-midway-app-id': 'v6worU4NnWyL' });
export async function qrCreate() {
    const response = await fetch(WEB_API + '/v1/auth/qrcode/create', { method: 'POST', headers: webHeaders(),
        body: JSON.stringify({ clientId: 'xyz-web' }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new PodcastError(502, `创建二维码失败（HTTP ${response.status}）`);
    const data = await response.json();
    if (typeof data.id !== 'string' || !data.id || data.id.length > 256) throw new PodcastError(502, '二维码响应异常');
    // Construct the known official scan target, rather than accepting an arbitrary returned URL.
    return { id: data.id, url: `https://h5.xiaoyuzhoufm.com/oauth?qrcode_id=${encodeURIComponent(data.id)}` };
}
export async function qrCheck(req: any, res: any, id: string) {
    const pending = readCookie(req, true);
    if (!pending || pending.id !== id) throw new PodcastError(400, '二维码已过期，请刷新');
    const response = await fetch(WEB_API + '/v1/auth/qrcode/login', { method: 'POST', headers: webHeaders(),
        body: JSON.stringify({ id }), signal: AbortSignal.timeout(15000) });
    if (response.status === 400 || response.status === 401) { setCookie(res, null, true); return { state: 'expired' }; }
    if (!response.ok) throw new PodcastError(502, `查询登录失败（HTTP ${response.status}）`);
    const data = await response.json();
    if (['USED', 'CONFIRMED'].includes(data.status)) {
        const access = response.headers.get('x-jike-access-token');
        const refresh = response.headers.get('x-jike-refresh-token');
        if (!access || !refresh) throw new PodcastError(502, '登录响应缺少授权信息，请重新扫码');
        setCookie(res, { access, refresh, device: pending.device });
        setCookie(res, null, true);
        return { state: 'confirmed' };
    }
    if (data.status === 'SCANNED') return { state: 'scanned' };
    if (data.status === 'EXPIRED') { setCookie(res, null, true); return { state: 'expired' }; }
    if (['WAITTING', 'WAITING'].includes(data.status)) return { state: 'waiting' };
    throw new PodcastError(502, '无法识别扫码状态，请刷新二维码');
}
export const newDevice = () => randomUUID().toUpperCase();
export async function accountFetch(req: any, res: any, path: string, body?: any, web = false) {
    let session = readCookie(req);
    if (!session?.access) throw new PodcastError(401, '请先登录小宇宙；公开节目仍可免登录收听');
    const run = () => fetch((web ? WEB_API : API) + path, {
        method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json',
            'User-Agent': 'Xiaoyuzhou/2.57.1 (build:1576; iOS 17.4.1)', OS: 'ios', Manufacturer: 'Apple',
            Model: 'iPhone14,2', BundleID: 'app.podcast.cosmos', 'App-Version': '2.57.1', 'App-BuildNo': '1576',
            Market: 'AppStore', 'x-jike-device-id': session.device, 'x-jike-access-token': session.access,
            ...(path.startsWith('/v1/episode-transcript/') ? {
                'User-Agent': 'Xiaoyuzhou/2.99.1(android 28)', OS: 'android', Manufacturer: 'Xiaomi',
                Model: 'MI 6', 'App-Version': '2.99.1', 'App-BuildNo': '1362', applicationid: 'app.podcast.cosmos',
            } : {}),
            ...(web ? { Origin: 'https://www.xiaoyuzhoufm.com', Referer: 'https://www.xiaoyuzhoufm.com/' } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    let response = await run();
    if (response.status === 401 && session.refresh) {
        const refreshed = await fetch(API + '/app_auth_tokens.refresh', { method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-jike-refresh-token': session.refresh }, signal: AbortSignal.timeout(15000) });
        const data = refreshed.ok ? await refreshed.json() : null;
        const value = data?.data || data;
        const access = refreshed.headers.get('x-jike-access-token') || value?.['x-jike-access-token'];
        const refresh = refreshed.headers.get('x-jike-refresh-token') || value?.['x-jike-refresh-token'];
        if (access && refresh) { session = { ...session, access, refresh }; setCookie(res, session); response = await run(); }
    }
    if (response.status === 401) { setCookie(res, null); throw new PodcastError(401, '登录已过期，公开节目仍可收听'); }
    if (!response.ok) throw new PodcastError(502, `小宇宙服务暂不可用（HTTP ${response.status}）`);
    return response.json();
}

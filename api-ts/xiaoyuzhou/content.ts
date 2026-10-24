// Public share-page parsing, shared by anonymous and authenticated podcast playback.
export const ID = /^[a-f0-9]{24}$/i;
export const WEB = 'https://www.xiaoyuzhoufm.com';
export const PUBLIC_IDS = ['6021f949a789fca4eff4492c', '64228877179eec53318a7182', '61de7563ca67da205ff02279'];
export const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
export function parseLink(input: string) {
    if (ID.test(input)) return { kind: 'podcast', id: input };
    try {
        const url = new URL(input);
        if (url.protocol !== 'https:' || !['www.xiaoyuzhoufm.com', 'xiaoyuzhoufm.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
        const match = /^\/(podcast|episode)\/([a-f0-9]{24})\/?$/i.exec(url.pathname);
        return match ? { kind: match[1], id: match[2] } : null;
    } catch { return null; }
}
export function image(raw: any): string {
    const value = raw?.largePicUrl || raw?.picUrl || raw?.middlePicUrl || raw?.smallPicUrl || '';
    return typeof value === 'string' && value.startsWith('https://') ? value : '';
}
export function podcast(raw: any) {
    if (!ID.test(raw?.pid || '')) throw new Error('Invalid podcast response');
    return { id: raw.pid, title: String(raw.title || ''), author: String(raw.author || ''),
        cover: image(raw.image), description: String(raw.description || raw.brief || ''), count: Number(raw.episodeCount) || 0 };
}
export function episode(raw: any, parent?: any) {
    if (!ID.test(raw?.eid || '')) throw new Error('Invalid episode response');
    const pod = raw.podcast || parent;
    return { id: raw.eid, title: String(raw.title || ''), duration: Math.max(0, Number(raw.duration) || 0),
        podcastId: pod?.pid || raw.pid || '', podcastTitle: String(pod?.title || ''), author: String(pod?.author || ''),
        cover: image(raw.image) || image(pod?.image), publishedAt: raw.pubDate || '',
        // Audio addresses are resolved afresh on the server, never saved in frontend song metadata.
        audio: raw.media?.source?.url || raw.enclosure?.url || '', private: raw.isPrivateMedia === true };
}
export function pageItems(body: any): { items: any[]; cursor: any } {
    if (Array.isArray(body?.data)) return { items: body.data, cursor: body.loadMoreKey ?? null };
    if (Array.isArray(body?.data?.data)) return { items: body.data.data, cursor: body.data.loadMoreKey ?? null };
    throw new Error('Invalid podcast list response');
}
export function extractPage(html: string) {
    const script = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!script) throw new Error('Podcast page data is missing');
    const data = JSON.parse(script[1]);
    if (data.page === '/404' || !data.props?.pageProps) throw new Error('Podcast was not found');
    return data.props.pageProps;
}
export async function publicPage(kind: string, id: string) {
    if (!['podcast', 'episode'].includes(kind) || !ID.test(id)) throw new Error('Invalid podcast link');
    const response = await fetch(`${WEB}/${kind}/${id}`, { redirect: 'error',
        headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Public podcast request failed (HTTP ${response.status})`);
    const html = await response.text();
    if (html.length > 4_000_000) throw new Error('Podcast response is too large');
    return extractPage(html);
}
export function allowedAudio(value: string): URL | null {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && (url.hostname === 'xyzcdn.net' || url.hostname.endsWith('.xyzcdn.net'))
            && !url.port && !url.username && !url.password ? url : null;
    } catch { return null; }
}

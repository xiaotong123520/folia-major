import { URL } from 'url';
// 当前文件：Vercel 歌词请求代理函数的 TypeScript 源文件。
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
    'Access-Control-Allow-Headers': [
        'X-CSRF-Token',
        'X-Requested-With',
        'Accept',
        'Accept-Version',
        'Content-Length',
        'Content-MD5',
        'Content-Type',
        'Date',
        'X-Api-Version',
        'KG-Rec',
        'KG-RC',
        'KG-CLIENTTIMEMS',
        'mid',
        'x-router',
    ].join(', '),
};
const IGNORED_FORWARD_HEADERS = [
    'host',
    'connection',
    'content-length',
    'origin',
    'referer',
    'cookie',
    'authorization',
    'proxy-authorization',
    'x-vercel-protection-bypass',
];
function isAllowedLyricProxyHost(hostname) {
    return hostname === 'qq.com' || hostname.endsWith('.qq.com') ||
        hostname === 'y.gtimg.cn' ||
        hostname === 'kugou.com' || hostname.endsWith('.kugou.com');
}
export default async function handler(req, res) {
    // Allow CORS for the proxy
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    const { url: targetUrlStr } = req.query;
    if (!targetUrlStr) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }
    try {
        const targetUrl = new URL(targetUrlStr);
        const hostname = targetUrl.hostname;
        // The owner's public lyric endpoint is relayed as read-only text, never as an arbitrary site proxy.
        if (targetUrl.origin === new URL('https://我爱南京.com').origin) {
            const album = targetUrl.searchParams.get('a') || '';
            const number = targetUrl.searchParams.get('n') || '';
            if (req.method !== 'GET' || targetUrl.username || targetUrl.password
                || targetUrl.pathname !== '/api/lyrics.php' || !album || album.length > 160
                || /[\\/\u0000-\u001f]/.test(album) || album === '..' || !/^[1-9]\d{0,3}$/.test(number)
                || [...targetUrl.searchParams.keys()].some(key => key !== 'a' && key !== 'n')) {
                return res.status(403).json({ error: 'Forbidden lyric request' });
            }
            const response = await fetch(targetUrl, { headers: { Accept: 'text/plain' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
            if (response.status === 204)
                return res.status(204).end();
            if (!response.ok)
                return res.status(502).json({ error: 'Lyrics unavailable' });
            if (!/text\/plain/i.test(response.headers.get('content-type') || ''))
                return res.status(502).json({ error: 'Invalid lyrics response' });
            const text = await response.text();
            if (text.length > 131072)
                return res.status(502).json({ error: 'Lyrics too large' });
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'public, max-age=300');
            return res.status(200).send(text);
        }
        // Security check: only allow proxying to known lyric provider domains
        const isAllowed = isAllowedLyricProxyHost(hostname);
        if (!isAllowed) {
            return res.status(403).json({ error: 'Forbidden: Domain not allowed' });
        }
        // Filter headers to forward
        const headers = {};
        for (const key of Object.keys(req.headers)) {
            if (!IGNORED_FORWARD_HEADERS.includes(key.toLowerCase())) {
                headers[key] = req.headers[key];
            }
        }
        if (hostname === 'u.y.qq.com') {
            headers.Cookie = 'tmeLoginType=-1;';
            headers['User-Agent'] = 'okhttp/3.14.9';
        }
        // Forward the method and body (if present and method is not GET/HEAD)
        const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
        const fetchOptions = {
            method: req.method,
            headers,
        };
        if (hasBody) {
            if (typeof req.body === 'object') {
                fetchOptions.body = JSON.stringify(req.body);
            }
            else {
                fetchOptions.body = req.body;
            }
        }
        const response = await fetch(targetUrl.toString(), fetchOptions);
        const contentType = response.headers.get('content-type') || '';
        // Forward response headers
        res.setHeader('Content-Type', contentType);
        if (contentType.includes('application/json')) {
            const json = await response.json();
            return res.status(response.status).json(json);
        }
        else {
            const buffer = await response.arrayBuffer();
            return res.status(response.status).send(Buffer.from(buffer));
        }
    }
    catch (error) {
        console.error('Proxy request failed:', error);
        return res.status(500).json({ error: 'Proxy request failed', details: String(error) });
    }
}

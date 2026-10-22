import http from 'node:http';
import https from 'node:https';
import { timingSafeEqual } from 'node:crypto';

const upstream = process.env.MUSIC_BACKEND_INTERNAL_URL || 'http://go-music-api:8080';
const apiKey = process.env.MUSIC_BACKEND_API_KEY || '';
// Optional public read-only mode for a static Pages frontend; never exposes admin routes.
const publicOrigins = (process.env.MUSIC_PUBLIC_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);

const maxRequests = Number(process.env.GATEWAY_MAX_REQUESTS_PER_MINUTE || 120);
const windowMs = 60_000;
const maxJsonBytes = 2_000_000;
const rate = new Map();

const allowlist = new Map([
  ['/api/v1/music/search', new Set(['q', 'keyword', 'type', 'sources', 'limit', 'offset'])],
  ['/api/v1/music/url', new Set(['id', 'source', 'name', 'artist', 'album', 'cover', 'duration', 'extra'])],
  ['/api/v1/music/stream', new Set(['id', 'source', 'name', 'artist', 'album', 'cover', 'duration', 'extra'])],
  ['/api/v1/music/inspect', new Set(['id', 'source', 'name', 'artist', 'album', 'cover', 'duration', 'extra'])],
  ['/api/v1/music/switch', new Set(['id', 'source', 'name', 'artist', 'album', 'cover', 'duration', 'extra'])],
  ['/api/v1/music/lyric', new Set(['id', 'source', 'name', 'artist', 'album', 'cover', 'duration', 'extra'])],
  ['/api/v1/playlist/detail', new Set(['id', 'source'])],
  ['/api/v1/album/detail', new Set(['id', 'source'])],
]);

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
}

function authorized(value) {
  if (!apiKey || !value?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(apiKey);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function limited(key) {
  const now = Date.now();
  for (const [id, item] of rate) if (item.until <= now) rate.delete(id);
  const current = rate.get(key);
  if (!current || current.until <= now) {
    rate.set(key, { count: 1, until: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > maxRequests;
}

function safePath(pathname) {
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part === '.' || part === '..')) return false;
  return allowlist.has(pathname);
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz' && req.method === 'GET') {
    res.writeHead(apiKey ? 200 : 503, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    return res.end(apiKey ? 'ok' : 'MUSIC_BACKEND_API_KEY is not configured');
  }
  const origin = req.headers.origin;
  const publicRead = Boolean(origin && publicOrigins.includes(origin));
  if (publicRead) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS');
    res.setHeader('access-control-allow-headers', 'Range, Accept');
    res.setHeader('access-control-expose-headers', 'Content-Range, Accept-Ranges, Content-Length');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(publicRead ? 204 : 403);
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method Not Allowed' });
  if (!publicRead && !authorized(req.headers.authorization)) return json(res, 401, { error: 'Unauthorized' });

  let parsed;
  try { parsed = new URL(req.url || '/', 'http://gateway.invalid'); }
  catch { return json(res, 400, { error: 'Invalid URL' }); }
  if (!safePath(parsed.pathname)) return json(res, 404, { error: 'Endpoint not allowed' });
  const allowedParams = allowlist.get(parsed.pathname);
  for (const [key, value] of parsed.searchParams) {
    if (!allowedParams.has(key)) return json(res, 400, { error: `Query parameter not allowed: ${key}` });
    if (value.length > 2048) return json(res, 400, { error: 'Query parameter too long' });
  }
  if (limited(req.socket.remoteAddress || 'unknown')) return json(res, 429, { error: 'Rate limit exceeded' });

  let target;
  try {
    target = new URL(upstream);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('invalid upstream');
    // Setting a URL pathname to '' normalizes back to '/', so trimming it in a loop never ends.
    target.pathname = target.pathname.replace(/\/+$/, '') + parsed.pathname;
    target.search = parsed.search;
  } catch {
    return json(res, 503, { error: 'Music backend upstream is not configured' });
  }

  const headers = { accept: req.headers.accept || 'application/json' };
  if (parsed.pathname === '/api/v1/music/stream' && req.headers.range) headers.range = req.headers.range;
  const requestImpl = target.protocol === 'https:' ? https.request : http.request;
  const upstreamReq = requestImpl(target, { method: req.method, headers, timeout: 25_000 }, upstreamRes => {
    const responseHeaders = {
      'cache-control': parsed.pathname === '/api/v1/music/stream' ? 'private, no-store' : 'no-store',
      'x-content-type-options': 'nosniff',
    };
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      if (upstreamRes.headers[name]) responseHeaders[name] = upstreamRes.headers[name];
    }
    if (req.method === 'HEAD' || parsed.pathname === '/api/v1/music/stream') {
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      upstreamRes.pipe(res);
      return;
    }
    let size = 0;
    const chunks = [];
    let tooLarge = false;
    upstreamRes.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxJsonBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    upstreamRes.on('end', () => {
      if (res.destroyed || res.writableEnded) return;
      if (tooLarge) {
        json(res, 502, { error: 'Upstream response exceeds 2 MB limit' });
        return;
      }
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      res.end(Buffer.concat(chunks));
    });
    upstreamRes.on('error', () => {
      if (res.writableEnded || res.destroyed) return;
      if (!res.headersSent) json(res, 502, { error: 'Upstream request failed' });
      else res.destroy();
    });
  });
  upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('upstream timeout')));
  upstreamReq.on('error', () => { if (!res.headersSent) json(res, 502, { error: 'Upstream request failed' }); else res.destroy(); });
  req.on('aborted', () => upstreamReq.destroy());
  upstreamReq.end();
});

const port = Number(process.env.PORT || 8090);
server.listen(port, '0.0.0.0', () => process.stdout.write(`music backend gateway listening on ${port}\n`));

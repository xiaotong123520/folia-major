// Private read-only music source fallback: Go API -> Meting API -> optional name-only endpoints.
// Put behind the existing Bearer-authenticated gateway; never expose this service directly.
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const SOURCES = { netease: 'netease', qq: 'tencent', kugou: 'kugou', kuwo: 'kuwo' };
const POINT = {
  netease: [['LuckyWYY', 'https://cer.luckying.love/music/LuckyWYY.php', 'Love']],
  qq: [
    ['lxink', 'https://api.lxink.cn/api-qqmusic/', 'songName'],
    ['LuckyQQ', 'https://cer.luckying.love/music/Lucky.php', 'Love'],
  ],
};
const TIMEOUT = 8500;
const MAX_JSON = 400_000;

function configUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', 'go-music-api', 'meting-api'].includes(url.hostname)) return null;
    url.search = ''; url.hash = '';
    return url;
  } catch { return null; }
}
function streamUrl(raw, hostAllowlist) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || isIP(host) || host === 'localhost') return null;
    if (!hostAllowlist.some(allowed => host === allowed || host.endsWith('.' + allowed))) return null;
    return url;
  } catch { return null; }
}
function paramUrl(base, values) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, String(value));
  return url;
}
function send(res, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': encoded.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(encoded);
}
async function loadText(response, limit = MAX_JSON) {
  if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('response too large');
  let total = 0;
  const chunks = [];
  if (!response.body) return '';
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > limit) throw new Error('response too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function remote(fetcher, url, opts = {}) {
  return fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), ...opts });
}
function chooseSongs(body) {
  const data = body?.data ?? body;
  return Array.isArray(data?.songs) ? data.songs : Array.isArray(data) ? data : [];
}
function canonicalSong(item) {
  if (!item || typeof item !== 'object') return null;
  if (!SOURCES[item.source] && item.source !== 'local') return null;
  if (typeof item.name !== 'string' || !item.name.trim() || !['string', 'number'].includes(typeof item.id)) return null;
  return item;
}
function songId(item, metingBase, publicOrigin) {
  const direct = item?.id ?? item?.url_id;
  if (direct != null && /^[a-zA-Z0-9_-]{1,128}$/.test(String(direct))) return String(direct);
  const raw = item?.url || item?.lrc || '';
  try {
    const url = new URL(raw);
    const okOrigin = url.origin === metingBase.origin || (publicOrigin && url.origin === publicOrigin);
    if (!okOrigin || !/\/api\/?$/.test(url.pathname)) return null;
    const id = url.searchParams.get('id');
    return id && /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? id : null;
  } catch { return null; }
}
function metingSong(item, source, metingBase, publicOrigin) {
  const id = songId(item, metingBase, publicOrigin);
  const name = String(item?.title || item?.name || '').trim();
  if (!id || !name) return null;
  const artist = String(item?.author || '').trim();
  return { id, source, name, artist, album: '', durationMs: 0, is_vip: false };
}
function legacyId(source, query) {
  return 'legacy-' + source + '-' + Buffer.from(query).toString('base64url');
}
function decodeLegacyId(id, source) {
  const prefix = 'legacy-' + source + '-';
  if (!id.startsWith(prefix) || id.length > 360) return null;
  try {
    const name = Buffer.from(id.slice(prefix.length), 'base64url').toString('utf8');
    return name && name.length <= 80 ? name : null;
  } catch { return null; }
}
function toMetingServer(source) { return SOURCES[source] || ''; }
function mimeOkay(response) {
  const mime = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  return mime.startsWith('audio/') || mime === 'application/octet-stream';
}
async function writeAudio(res, response, method) {
  if (![200, 206].includes(response.status) || !mimeOkay(response) || !response.body) return false;
  const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
    'content-type': response.headers.get('content-type') || 'application/octet-stream' };
  for (const key of ['content-range', 'content-length', 'accept-ranges', 'etag', 'last-modified']) {
    const value = response.headers.get(key);
    if (value) headers[key] = value;
  }
  res.writeHead(response.status, headers);
  if (method === 'HEAD') { await response.body.cancel(); res.end(); return true; }
  Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
  return true;
}

export function createFallbackHandler(env = process.env, fetcher = fetch) {
  const primary = configUrl(env.MUSIC_PRIMARY_BACKEND_URL);
  const meting = configUrl(env.MUSIC_METING_BASE_URL);
  const token = (env.MUSIC_METING_TOKEN || '').trim();
  const publicOrigin = configUrl(env.MUSIC_METING_PUBLIC_URL)?.origin || '';
  const hosts = (env.MUSIC_AUDIO_ALLOW_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s && !s.startsWith('.') && !s.includes('/') && !s.includes(':') && !isIP(s) && s !== 'localhost');
  const allowNameLookup = env.MUSIC_ENABLE_NAME_LOOKUP === 'true';
  const platforms = (env.MUSIC_SEARCH_SOURCES || 'netease,qq,kugou,kuwo').split(',').filter(s => Object.hasOwn(SOURCES, s));
  const metingCall = async (source, type, id) => {
    if (!meting || !token) return null;
    const server = toMetingServer(source);
    if (!server) return null;
    const url = paramUrl(meting, { server, type, id });
    if (type === 'url' || type === 'lrc') url.searchParams.set('auth', createHmac('sha1', token).update(server + type + id).digest('hex'));
    return remote(fetcher, url);
  };
  const tryPrimary = async (path, query, req) => {
    if (!primary) return null;
    const target = new URL(primary);
    target.pathname = target.pathname.replace(/\/+$/, '') + path;
    target.search = query.toString();
    try { return await remote(fetcher, target, { method: req.method, headers: { accept: req.headers.accept || '*/*', ...(req.headers.range ? { range: req.headers.range } : {}) } }); }
    catch { return null; }
  };
  async function streamFrom(response, req, res) {
    if (!response) return false;
    if (response.status === 200 || response.status === 206) return writeAudio(res, response, req.method);
    if (![301, 302, 303, 307, 308].includes(response.status)) return false;
    const target = streamUrl(response.headers.get('location'), hosts);
    if (!target) return false;
    try {
      const stream = await remote(fetcher, target, { method: req.method, headers: { ...(req.headers.range ? { range: req.headers.range } : {}), accept: 'audio/*' } });
      return writeAudio(res, stream, req.method);
    } catch { return false; }
  }
  async function resolvePoint(source, name, req, res) {
    if (!allowNameLookup || !name || name.length > 80 || !Object.hasOwn(POINT, source)) return false;
    for (const [label, endpoint, parameter] of POINT[source]) {
      const url = new URL(endpoint);
      url.searchParams.set(parameter, name);
      if (label === 'lxink') { url.searchParams.set('action', 'play'); url.searchParams.set('type', 'vip'); }
      try {
        const answer = await remote(fetcher, url, { headers: { accept: '*/*', ...(req.headers.range ? { range: req.headers.range } : {}) } });
        if (await streamFrom(answer, req, res)) return true;
        if (answer.ok && /(?:json|text)/i.test(answer.headers.get('content-type') || '')) {
          const raw = await loadText(answer, 16384);
          let value;
          try { value = JSON.parse(raw); } catch { value = raw.trim(); }
          // Never treat an arbitrary HTML/JSON body as audio. Only bounded HTTPS media links
          // on explicitly configured hostnames are eligible for follow-up requests.
          const candidate = typeof value === 'string' ? value
            : typeof value?.data === 'string' ? value.data
            : value?.data?.url || value?.data?.music_url || value?.url || value?.music_url || value?.data?.src || '';
          const safe = streamUrl(candidate, hosts);
          if (safe) {
            const audio = await remote(fetcher, safe, { method: req.method, headers: { accept: 'audio/*', ...(req.headers.range ? { range: req.headers.range } : {}) } });
            if (await writeAudio(res, audio, req.method)) return true;
          }
        }
      } catch { /* Use next configured source. */ }
    }
    return false;
  }
  return async (req, res) => {
    let url;
    try { url = new URL(req.url || '/', 'http://internal.invalid'); } catch { return send(res, 400, { code: 400, msg: 'Invalid URL' }); }
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { code: 405, msg: 'Method not allowed' });
    if (!['/api/v1/music/search', '/api/v1/music/stream', '/api/v1/music/lyric'].includes(url.pathname)) {
      return send(res, 404, { code: 404, msg: 'Route not found' });
    }
    const source = (url.searchParams.get('source') || '').toLowerCase();
    const id = (url.searchParams.get('id') || '').trim();
    if (url.pathname === '/api/v1/music/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q || q.length > 80) return send(res, 400, { code: 400, msg: 'Query must have 1–80 characters' });
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20) || 20));
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
      const unique = new Map();
      const primaryResponse = await tryPrimary(url.pathname, url.searchParams, req);
      if (primaryResponse?.ok) {
        try {
          const data = JSON.parse(await loadText(primaryResponse));
          for (const song of chooseSongs(data)) {
            const valid = canonicalSong(song);
            if (valid) unique.set(valid.source + ':' + valid.id, valid);
          }
        } catch { /* Continue with documented Meting source. */ }
      }
      if (meting && token) {
        const batch = await Promise.allSettled(platforms.map(async s => {
          const result = await metingCall(s, 'search', q);
          if (!result?.ok) return [];
          const raw = JSON.parse(await loadText(result));
          const songs = Array.isArray(raw) ? raw : chooseSongs(raw);
          return songs.slice(0, 80).map(item => metingSong(item, s, meting, publicOrigin)).filter(Boolean);
        }));
        for (const outcome of batch) if (outcome.status === 'fulfilled') for (const song of outcome.value) {
          if (!unique.has(song.source + ':' + song.id)) unique.set(song.source + ':' + song.id, song);
        }
      }
      // Show explicit name-based point-song alternatives even when catalog search has matches.
      // Name-only APIs cannot prove which recording they return; users choose this fallback.
      if (allowNameLookup && offset === 0) {
        for (const s of ['netease', 'qq']) {
          unique.set('point:' + s, {
            id: legacyId(s, q), source: s, name: q,
            artist: s === 'netease' ? '网易云点歌接口（版本待验证）' : 'QQ点歌接口（版本待验证）',
            album: '按名称点歌', durationMs: 0, is_vip: false,
          });
        }
      }
      const songs = [...unique.values()];
      return send(res, 200, { code: 200, data: { songs: songs.slice(offset, offset + limit), total: songs.length } });
    }
    if (!Object.hasOwn(SOURCES, source) && source !== 'local') return send(res, 400, { code: 400, msg: 'Unsupported source' });
    if (!id || id.length > 350) return send(res, 400, { code: 400, msg: 'Invalid track ID' });
    if (url.pathname === '/api/v1/music/lyric') {
      const primaryResponse = await tryPrimary(url.pathname, url.searchParams, req);
      if (primaryResponse?.ok) {
        try {
          const text = await loadText(primaryResponse);
          const obj = JSON.parse(text);
          const lyric = obj?.data?.lyric || obj?.data?.lyrics || '';
          if (lyric) return send(res, 200, obj);
        } catch {}
      }
      try {
        const response = await metingCall(source, 'lrc', id);
        if (response?.ok) return send(res, 200, { code: 200, data: { lyric: await loadText(response) } });
      } catch {}
      return send(res, 200, { code: 200, data: { lyric: '' } });
    }
    // Stream the *same* source and ID. Never replace a matched track by same-title search.
    const nameLookup = decodeLegacyId(id, source);
    if (nameLookup && allowNameLookup) {
      if (await resolvePoint(source, nameLookup, req, res)) return;
      return send(res, 404, { code: 404, msg: 'Name-based sources failed or were not authorized' });
    }
    const original = await tryPrimary(url.pathname, url.searchParams, req);
    if (await streamFrom(original, req, res)) return;
    if (meting && token && source !== 'local' && /^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      try {
        const audioResponse = await metingCall(source, 'url', id);
        if (await streamFrom(audioResponse, req, res)) return;
      } catch {}
    }
    return send(res, 404, { code: 404, msg: 'No authorized playable stream found' });
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const handler = createFallbackHandler();
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(() => {
      if (!res.headersSent) send(res, 502, { code: 502, msg: 'Upstream failed' });
      else res.destroy();
    });
  });
  server.listen(Number(process.env.PORT || 8093), '0.0.0.0', () => process.stdout.write('music source fallback listening\n'));
}

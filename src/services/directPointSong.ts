/**
 * Direct browser-only song URL candidates for static GitHub Pages builds.
 * None of these routes gives access to platform membership or protected recordings.
 * They may return JSON/HTML instead of audio; HTMLAudioElement reports those as errors.
 */
export type PointSongSource = 'qq-primary' | 'qq-backup' | 'netease';

export interface PointSongCandidate {
  label: string;
  url: string;
}

export interface PointSongImport {
  name: string;
  url: string;
  fallbackUrls: string[];
}

const MAX_TITLE = 80;

export function createPointSongImport(rawTitle: string, source: PointSongSource): PointSongImport | null {
  const title = rawTitle.trim().replace(/\s+/g, ' ');
  if (!title || title.length > MAX_TITLE || /[\u0000-\u001f\u007f]/.test(title)) return null;

  const qqFirst = new URL('https://api.lxink.cn/api-qqmusic/');
  qqFirst.searchParams.set('action', 'play');
  qqFirst.searchParams.set('type', 'vip');
  qqFirst.searchParams.set('songName', title);
  const qqSecond = new URL('https://cer.luckying.love/music/Lucky.php');
  qqSecond.searchParams.set('Love', title);
  const netease = new URL('https://cer.luckying.love/music/LuckyWYY.php');
  netease.searchParams.set('Love', title);

  switch (source) {
    case 'qq-primary':
      return { name: title + ' · QQ 点歌', url: qqFirst.href, fallbackUrls: [qqSecond.href] };
    case 'qq-backup':
      return { name: title + ' · QQ 备用', url: qqSecond.href, fallbackUrls: [] };
    case 'netease':
      return { name: title + ' · 网易云点歌', url: netease.href, fallbackUrls: [] };
    default:
      return null;
  }
}


const POINT_ENDPOINTS = new Set([
  'api.lxink.cn/api-qqmusic/',
  'cer.luckying.love/music/Lucky.php',
  'cer.luckying.love/music/LuckyWYY.php',
]);

function safeAudioUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) return null;
    return url.href;
  } catch { return null; }
}

/** Parse a small browser-readable JSON/text API result without assuming its shape. */
export function parsePointSongMediaUrl(raw: unknown): string | null {
  const direct = safeAudioUrl(raw);
  if (direct) return direct;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const keys = ['url', 'music_url', 'musicUrl', 'play_url', 'playUrl', 'audio', 'src', 'link', 'mp3'];
  for (const key of keys) {
    const valid = safeAudioUrl(item[key]);
    if (valid) return valid;
  }
  return item.data && item.data !== raw ? parsePointSongMediaUrl(item.data) : null;
}

/**
 * Best-effort JSON resolver for static pages. Browser CORS policies still apply.
 * Only sends a GET to the three hard-coded vendor endpoints, never arbitrary URLs.
 * A rejected/opaque/HTML response simply returns null; the audio player can try its backup.
 */
export async function resolvePointSongMediaUrl(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const endpoint = new URL(input);
    if (endpoint.protocol !== 'https:' || !POINT_ENDPOINTS.has(endpoint.host + endpoint.pathname)) return null;
    const response = await fetchImpl(endpoint.href, {
      method: 'GET',
      credentials: 'omit',
      mode: 'cors',
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (!response.ok) return null;
    const mime = (response.headers.get('content-type') || '').toLowerCase();
    if (mime.startsWith('audio/') || mime.startsWith('application/octet-stream')) {
      await response.body?.cancel();
      return safeAudioUrl(response.url);
    }
    if (!/json|text\/plain/i.test(mime)) {
      await response.body?.cancel();
      return null;
    }
    if (Number(response.headers.get('content-length') || 0) > 16384) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const content = new TextDecoder().decode(bytes).trim();
    try { return parsePointSongMediaUrl(JSON.parse(content)); }
    catch { return safeAudioUrl(content); }
  } catch {
    return null;
  }
}

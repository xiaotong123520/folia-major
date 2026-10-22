/** Network-free recognition of shared music URLs. Recognition never grants subscription access. */
export type MusicLinkPlatform = 'netease' | 'qq' | 'kugou' | 'kuwo' | 'apple-music' | 'youtube' | 'youtube-music' | 'soundcloud' | 'navidrome' | 'direct-audio' | 'unknown';
export type MusicLinkKind = 'track' | 'album' | 'playlist' | 'artist' | 'video' | 'server' | 'audio' | 'unknown';
export type MusicLinkAccess = 'provider-page' | 'official-embed' | 'existing-provider-adapter' | 'server-library' | 'direct-audio' | 'unsupported';
export interface MusicLinkResolution {
  inputUrl: string;
  normalizedUrl: string;
  platform: MusicLinkPlatform;
  kind: MusicLinkKind;
  resourceId?: string;
  access: MusicLinkAccess;
  canResolveMetadata: boolean;
  canPlayInFolia: boolean;
  requiresUserEntitlement?: boolean;
  note: string;
}
const parseUrl = (input: string): URL | null => {
  if (!input.trim() || input.length > 4096) return null;
  try {
    const url = new URL(input.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch { return null; }
};
const hostIs = (host: string, domain: string): boolean => host === domain || host.endsWith('.' + domain);
const pathId = (url: URL, pattern: RegExp): string | undefined => url.pathname.match(pattern)?.[1];

export function resolveMusicLink(input: string): MusicLinkResolution {
  const url = parseUrl(input);
  if (!url) return {
    inputUrl: input, normalizedUrl: '', platform: 'unknown', kind: 'unknown', access: 'unsupported',
    canResolveMetadata: false, canPlayInFolia: false,
    note: '请输入有效的 HTTP(S) 音乐分享链接；不接受 file:、javascript: 或带账号密码的 URL。',
  };

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  // Local/private URLs must never be forwarded to an external metadata service.
  // This parser performs no network requests.
  // Some NetEase share links put their resource ID inside the URL fragment.
  const hashQuery = new URLSearchParams(url.hash.replace(/^#\/?/, '').replace(/^.*?\?/, ''));
  // Keep fragments: NetEase share routes commonly encode the resource ID in #/song?id=...
  const normalizedUrl = url.toString();

  const make = (
    platform: MusicLinkPlatform, kind: MusicLinkKind, access: MusicLinkAccess, note: string,
    resourceId?: string, canResolveMetadata = true, canPlayInFolia = false, requiresUserEntitlement?: boolean,
  ): MusicLinkResolution => ({
    inputUrl: input, normalizedUrl, platform, kind, ...(resourceId ? { resourceId } : {}),
    access, canResolveMetadata, canPlayInFolia,
    ...(requiresUserEntitlement === undefined ? {} : { requiresUserEntitlement }), note,
  });

  if (hostIs(host, 'music.163.com')) {
    const id = url.searchParams.get('id') ?? hashQuery.get('id') ?? pathId(url, /\/(?:song|album|playlist|artist)\/(\d+)/);
    const route = url.hash + url.pathname;
    const kind: MusicLinkKind = /playlist/.test(route) ? 'playlist' : /album/.test(route) ? 'album' : /artist/.test(route) ? 'artist' : 'track';
    return make('netease', kind, 'existing-provider-adapter', '网易云链接已识别；播放仍取决于现有 provider、曲目可用性和账号权限。', id ?? undefined, true, true);
  }
  if (hostIs(host, 'y.qq.com') || hostIs(host, 'c.y.qq.com') || hostIs(host, 'i.y.qq.com')) {
    const id = url.searchParams.get('songmid') ?? url.searchParams.get('id') ?? pathId(url, /\/(?:songDetail|albumDetail|playlist)\/([^/?]+)/);
    const kind: MusicLinkKind = /playlist/.test(url.pathname) ? 'playlist' : /album/i.test(url.pathname) ? 'album' : 'track';
    return make('qq', kind, 'existing-provider-adapter', 'QQ 音乐链接已识别；会员标识不会自动解锁版权曲目。', id ?? undefined, true, true);
  }
  if (hostIs(host, 'kugou.com')) {
    const id = url.searchParams.get('hash') ?? url.searchParams.get('album_id') ?? hashQuery.get('hash') ?? pathId(url, /\/(?:song|album|yy)\/([^/?]+)/);
    const kind: MusicLinkKind = /album/.test(url.pathname) ? 'album' : /playlist|special/.test(url.pathname) ? 'playlist' : 'track';
    return make('kugou', kind, 'existing-provider-adapter', '酷狗链接已识别；播放需由现有适配器确认资源可用。', id ?? undefined, true, true);
  }
  if (hostIs(host, 'kuwo.cn')) {
    const id = url.searchParams.get('mid') ?? pathId(url, /\/(?:play_detail|album_detail|artist|playlist)\/([^/?]+)/);
    const kind: MusicLinkKind = /album/.test(url.pathname) ? 'album' : /playlist/.test(url.pathname) ? 'playlist' : /artist/.test(url.pathname) ? 'artist' : 'track';
    return make('kuwo', kind, 'unsupported', '酷我链接已识别，但 Folia 仍需实现并测试酷我 provider。', id, true, false);
  }
  if (hostIs(host, 'music.apple.com')) {
    const id = url.searchParams.get('i') ?? pathId(url, /\/(?:album|playlist|artist)\/[^/]+\/(\d{5,})/);
    const kind: MusicLinkKind = /\/playlist\//.test(url.pathname) ? 'playlist' : /\/artist\//.test(url.pathname) ? 'artist' : /\/album\//.test(url.pathname) && !url.searchParams.has('i') ? 'album' : 'track';
    return make('apple-music', kind, 'official-embed', 'Apple Music 已识别；完整播放需官方 MusicKit 授权、有效开发者 token 和符合条件的订阅。', id, true, false, true);
  }
  if (hostIs(host, 'music.youtube.com') || hostIs(host, 'youtube.com') || host === 'youtu.be' || hostIs(host, 'youtube-nocookie.com')) {
    const music = hostIs(host, 'music.youtube.com');
    const id = host === 'youtu.be' ? url.pathname.slice(1).split('/')[0] : url.searchParams.get('v') ?? pathId(url, /\/embed\/([^/?]+)/);
    return make(music ? 'youtube-music' : 'youtube', 'video', 'official-embed', 'YouTube 链接已识别；网页端使用官方播放器，不提取受保护音频流。', id || undefined, true, true);
  }
  if (hostIs(host, 'soundcloud.com') || hostIs(host, 'on.soundcloud.com')) {
    return make('soundcloud', 'track', 'official-embed', 'SoundCloud 链接已识别；应使用官方嵌入或授权 API，部分曲目可能受限制。', undefined, true, true);
  }
  if (/\/rest\/(?:stream|download|search|ping|scrobble)(?:\.view)?$/i.test(url.pathname)) return make('navidrome', 'server', 'server-library', '看起来是 Subsonic/Navidrome 接口；请在 Folia 服务器音乐设置中配置可信服务器。', undefined, false, true);
  if (/\.(mp3|m4a|aac|ogg|opus|wav|flac|mp4|webm)$/i.test(url.pathname)) {
    return make('direct-audio', 'audio', 'direct-audio', '识别为媒体直链；仅在来源可信且访问权限、跨域设置允许时播放。', undefined, false, true);
  }
  return make('unknown', 'unknown', 'unsupported', '暂不支持此域名；请粘贴平台标准分享链接或使用服务器音乐库。', undefined, false, false);
}
/** True only if this resolver says Folia has a playback route for the URL. */
export function isSupportedMusicLink(input: string): boolean {
  const result = resolveMusicLink(input);
  return result.platform !== 'unknown' && result.access !== 'unsupported' && result.canPlayInFolia;
}

/** True when a known provider owns the URL, whether or not playback is implemented. */
export function isRecognizedMusicLink(input: string): boolean {
  return resolveMusicLink(input).platform !== 'unknown';
}

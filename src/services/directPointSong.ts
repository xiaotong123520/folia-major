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

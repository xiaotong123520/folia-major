import { describe, expect, it } from 'vitest';
import { isRecognizedMusicLink, isSupportedMusicLink, resolveMusicLink } from '../../src/services/musicLinkResolver';

describe('resolveMusicLink', () => {
  it('does not advertise playback for provider homepages or unimplemented embeds', () => {
    expect(isSupportedMusicLink('https://music.163.com/')).toBe(false);
    expect(isSupportedMusicLink('https://music.163.com/#/playlist?id=123')).toBe(false);
    expect(isSupportedMusicLink('https://www.youtube.com/watch?v=abcdefghijk')).toBe(false);
    expect(isSupportedMusicLink('https://soundcloud.com/artist/song')).toBe(false);
    expect(isSupportedMusicLink('https://cdn.example.com/song.mp3')).toBe(true);
  });

  it.each([
    ['https://music.163.com/#/song?id=123456', 'netease', 'track'],
    ['https://y.qq.com/n/ryqq/songDetail/003abc', 'qq', 'track'],
    ['https://www.kugou.com/song/#hash=ABC123', 'kugou', 'track'],
    ['https://www.kuwo.cn/play_detail/12345', 'kuwo', 'track'],
    ['https://music.apple.com/us/album/example/123456789?i=123456790', 'apple-music', 'track'],
    ['https://www.youtube.com/watch?v=abcdefghijk', 'youtube', 'video'],
    ['https://music.youtube.com/watch?v=abcdefghijk', 'youtube-music', 'video'],
    ['https://soundcloud.com/artist/example-track', 'soundcloud', 'track'],
    ['https://cdn.example.com/song.mp3', 'direct-audio', 'audio'],
  ] as const)('recognizes %s', (input, platform, kind) => {
    const result = resolveMusicLink(input);
    expect(result.platform).toBe(platform);
    expect(result.kind).toBe(kind);
    expect(result.normalizedUrl.startsWith('https://') || result.normalizedUrl.startsWith('http://')).toBe(true);
  });

  it('reads NetEase song IDs from the share URL fragment', () => {
    const result = resolveMusicLink('https://music.163.com/#/song?id=123456');
    expect(result.resourceId).toBe('123456');
    expect(result.normalizedUrl).toContain('#/song?id=123456');
  });

  it('does not imply Apple Music playback from URL recognition', () => {
    const result = resolveMusicLink('https://music.apple.com/us/album/example/123456789');
    expect(result.canResolveMetadata).toBe(true);
    expect(result.canPlayInFolia).toBe(false);
    expect(result.requiresUserEntitlement).toBe(true);
    expect(result.resourceId).toBe('123456789');
  });

  it('rejects unsafe schemes and credentials', () => {
    expect(resolveMusicLink('javascript:alert(1)').platform).toBe('unknown');
    expect(resolveMusicLink('file:///private/song.mp3').platform).toBe('unknown');
    expect(resolveMusicLink('https://user:pass@example.com/song.mp3').platform).toBe('unknown');
    expect(isSupportedMusicLink('not a url')).toBe(false);
    expect(isRecognizedMusicLink('https://www.kuwo.cn/play_detail/12345')).toBe(true);
    expect(isSupportedMusicLink('https://www.kuwo.cn/play_detail/12345')).toBe(false);
    expect(isSupportedMusicLink('https://music.apple.com/us/album/example/123456789')).toBe(false);
  });

  it('does not claim Kuwo is wired to playback', () => {
    const result = resolveMusicLink('https://www.kuwo.cn/play_detail/12345');
    expect(result.access).toBe('unsupported');
    expect(result.canPlayInFolia).toBe(false);
  });
});

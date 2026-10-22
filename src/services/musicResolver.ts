/**
 * Folia online music resolver contract.
 *
 * This module deliberately resolves only through configured, authorized provider
 * endpoints. It does not decrypt private app traffic, scrape protected playback
 * tokens, or bypass subscription/DRM checks.
 *
 * The caller should pass a server-side endpoint that the operator controls.
 * Keep provider cookies/session secrets on the server; never place them in VITE_ vars.
 */

export type MusicProvider = 'netease' | 'qq' | 'kugou';

export interface TrackQuery {
  provider: MusicProvider;
  keyword: string;
  limit?: number;
}

export interface TrackCandidate {
  provider: MusicProvider;
  id: string;
  title: string;
  artists: string[];
  album?: string;
  coverUrl?: string;
  durationMs?: number;
}

export interface PlaybackRequest {
  provider: MusicProvider;
  trackId: string;
  /** Optional quality requested from the provider, e.g. standard/high/lossless. */
  quality?: string;
}

export interface PlaybackResult {
  /** URL returned by the authorized provider backend. May be short-lived. */
  url: string;
  expiresAt?: string;
  mimeType?: string;
  /** Whether the provider requires a signed-in account for this stream. */
  requiresLogin?: boolean;
}

export interface MusicResolverConfig {
  /** Same-origin API base, e.g. /api/music. Do not include secrets in this value. */
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class MusicResolverError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'MusicResolverError';
  }
}

export class MusicResolver {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: MusicResolverConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 12_000;
  }

  async search(query: TrackQuery): Promise<TrackCandidate[]> {
    const keyword = query.keyword.trim();
    if (!keyword) throw new MusicResolverError('请输入歌曲名或歌手名', 400, 'EMPTY_QUERY');
    if (!this.isProvider(query.provider)) {
      throw new MusicResolverError('不支持的音乐平台', 400, 'UNSUPPORTED_PROVIDER');
    }

    const payload = await this.request<unknown>('/search', {
      provider: query.provider,
      keyword,
      limit: Math.min(Math.max(query.limit ?? 10, 1), 30),
    });

    if (!Array.isArray(payload)) {
      throw new MusicResolverError('音乐服务返回的数据格式不正确', 502, 'INVALID_RESPONSE');
    }

    return payload.map((item, index) => this.normalizeTrack(item, query.provider, index))
      .filter((item): item is TrackCandidate => item !== null);
  }

  async getPlayback(request: PlaybackRequest): Promise<PlaybackResult> {
    if (!this.isProvider(request.provider) || !request.trackId.trim()) {
      throw new MusicResolverError('缺少平台或歌曲 ID', 400, 'INVALID_REQUEST');
    }

    const result = await this.request<unknown>('/playback', {
      provider: request.provider,
      trackId: request.trackId,
      quality: request.quality ?? 'standard',
    });

    if (!result || typeof result !== 'object' || !('url' in result)) {
      throw new MusicResolverError('该歌曲暂时没有可用的授权播放地址', 404, 'NO_PLAYBACK_URL');
    }

    const data = result as Record<string, unknown>;
    if (typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url)) {
      throw new MusicResolverError('播放服务返回了无效地址', 502, 'INVALID_PLAYBACK_URL');
    }

    return {
      url: data.url,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
      mimeType: typeof data.mimeType === 'string' ? data.mimeType : undefined,
      requiresLogin: Boolean(data.requiresLogin),
    };
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json = await response.json().catch(() => null) as
        | { data?: T; message?: string; error?: string; code?: string }
        | null;

      if (!response.ok) {
        throw new MusicResolverError(
          json?.message ?? json?.error ?? `音乐服务请求失败（HTTP ${response.status}）`,
          response.status,
          json?.code,
        );
      }
      if (json && typeof json === 'object' && 'data' in json) return json.data as T;
      return json as T;
    } catch (error) {
      if (error instanceof MusicResolverError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MusicResolverError('音乐服务响应超时，请稍后重试', 504, 'TIMEOUT');
      }
      throw new MusicResolverError('无法连接音乐服务，请检查后端 API 配置', 502, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeTrack(value: unknown, provider: MusicProvider, index: number): TrackCandidate | null {
    if (!value || typeof value !== 'object') return null;
    const item = value as Record<string, unknown>;
    const id = item.id ?? item.songId ?? item.mid;
    const title = item.title ?? item.name;
    if ((typeof id !== 'string' && typeof id !== 'number') || typeof title !== 'string') return null;

    const artistValue = item.artists ?? item.artist ?? item.singer;
    const artists = Array.isArray(artistValue)
      ? artistValue.map((artist) => {
          if (typeof artist === 'string') return artist;
          if (artist && typeof artist === 'object') {
            const record = artist as Record<string, unknown>;
            return String(record.name ?? record.title ?? '');
          }
          return '';
        }).filter(Boolean)
      : typeof artistValue === 'string' ? [artistValue] : [];

    const duration = item.durationMs ?? item.duration ?? item.interval;
    return {
      provider,
      id: String(id),
      title,
      artists,
      album: typeof item.album === 'string' ? item.album
        : typeof item.albumName === 'string' ? item.albumName : undefined,
      coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl
        : typeof item.picUrl === 'string' ? item.picUrl : undefined,
      durationMs: typeof duration === 'number' && Number.isFinite(duration)
        ? (duration > 100_000 ? duration : duration * 1000) : undefined,
    };
  }

  private isProvider(value: string): value is MusicProvider {
    return value === 'netease' || value === 'qq' || value === 'kugou';
  }
}

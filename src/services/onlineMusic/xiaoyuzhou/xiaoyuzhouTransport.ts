import { OnlineProviderError } from '../../../types/onlineMusic';

// The same-origin backend holds the optional account; all public calls also work anonymously.
export const podcastApi = '/api/podcast';
export const podcastAvailable = () => ({ configured: typeof location === 'undefined' || (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io')) });
export async function requestPodcast<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(podcastApi, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Podcast-Request': '1' },
        body: JSON.stringify({ action, ...params }), signal: AbortSignal.timeout(25000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || !('data' in body)) {
        throw new OnlineProviderError(response.status === 401 ? 'auth-required' : 'unavailable',
            body?.error || 'Podcast service is unavailable', 'xiaoyuzhou');
    }
    return body.data as T;
}

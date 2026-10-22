/**
 * Optional HTTPS Folia gateway for static GitHub Pages builds.
 *
 * The setting is public (a base URL), never an API key. Provider cookies,
 * OAuth tokens, and server credentials must not be stored here.
 */
export const FOLIA_SERVER_STORAGE_KEY = 'folia.preview.serverBase.v1';
export type FoliaProviderRoute = 'netease' | 'qq' | 'kugou';

type RuntimeConfig = { foliaApiBase?: string };
type FoliaRuntimeWindow = Window & { __FOLIA_RUNTIME_CONFIG__?: RuntimeConfig };

export function normalizeFoliaServerBase(input: string): string | null {
    if (!input || input.length > 512) return null;
    try {
        const url = new URL(input.trim());
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname))) return null;
        if (url.username || url.password || url.search || url.hash) return null;
        if (!url.hostname || /[\\*%]/.test(url.hostname)) return null;
        if (url.pathname !== '/' && url.pathname !== '') return null;
        return url.origin;
    } catch {
        return null;
    }
}

/** Call once on boot or after the user saves a new address. */
export function getFoliaServerBase(): string | null {
    if (typeof window !== 'undefined' && !window.electron) {
        try {
            const saved = window.localStorage.getItem(FOLIA_SERVER_STORAGE_KEY);
            if (saved) return normalizeFoliaServerBase(saved);
        } catch { /* Local storage may be disabled. */ }
        const runtime = (window as FoliaRuntimeWindow).__FOLIA_RUNTIME_CONFIG__?.foliaApiBase;
        if (runtime) return normalizeFoliaServerBase(runtime);
    }
    const vite = import.meta.env?.VITE_FOLIA_SERVER_BASE;
    return typeof vite === 'string' ? normalizeFoliaServerBase(vite) : null;
}

export function foliaProviderApiBase(provider: FoliaProviderRoute): string | null {
    const base = getFoliaServerBase();
    return base ? `${base}/${provider}` : null;
}

/** All paths must be application-owned, never arbitrary URL forwarding. */
export function foliaBackendApiUrl(path: `/api/${string}`): string {
    const base = getFoliaServerBase();
    return base ? `${base}${path}` : path;
}

export function saveFoliaServerBase(input: string): boolean {
    if (typeof window === 'undefined' || window.electron) return false;
    const base = normalizeFoliaServerBase(input);
    if (!base) return false;
    try {
        window.localStorage.setItem(FOLIA_SERVER_STORAGE_KEY, base);
        return true;
    } catch {
        return false;
    }
}

export function clearFoliaServerBase(): void {
    if (typeof window === 'undefined') return;
    try { window.localStorage.removeItem(FOLIA_SERVER_STORAGE_KEY); } catch { /* ignored */ }
}

/** Do not trust an unrelated service that happens to answer HTTP 200. */
export async function probeFoliaServer(input: string, signal?: AbortSignal): Promise<boolean> {
    const base = normalizeFoliaServerBase(input);
    if (!base) return false;
    const response = await fetch(`${base}/api/healthz`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        signal,
    });
    if (!response.ok) return false;
    const data: unknown = await response.json();
    return Boolean(data && typeof data === 'object' &&
        (data as { ok?: unknown; service?: unknown }).ok === true &&
        (data as { ok?: unknown; service?: unknown }).service === 'folia-web-api');
}

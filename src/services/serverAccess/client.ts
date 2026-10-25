import { useServerAccessStore, validSession } from './store';

// The API stores and validates sessions; this client never receives SMTP credentials.
const api = String(import.meta.env.VITE_SERVER_ACCESS_API_BASE || '/api/server-access');
export const serverAccessRequired = () => import.meta.env.VITE_SERVER_ACCESS_REQUIRED === 'true' && !window.electron;
export class ServerAccessError extends Error {
    constructor(readonly code: string) { super('Server access: ' + code); }
}
export async function accessRequest<T>(action: string, body: Record<string, string> = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(api, {
            method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30000),
            headers: { 'Content-Type': 'application/json', 'X-Tingyu-Access': '1', Authorization: 'Bearer ' + validSession() },
            body: JSON.stringify({ ...body, action }),
        });
    } catch { throw new ServerAccessError('unavailable'); }
    let value: { data?: T; error?: string };
    try { value = await response.json(); } catch { throw new ServerAccessError('unavailable'); }
    if (!response.ok || !value.data) throw new ServerAccessError(value.error || 'unavailable');
    return value.data;
}

let pending: Promise<void> | null = null;
function askForAccess(): Promise<void> {
    if (pending) return pending;
    pending = new Promise<void>((resolve, reject) => {
        const store = useServerAccessStore;
        store.getState().setOpen(true);
        const unsubscribe = store.subscribe(state => {
            if (state.open) return;
            unsubscribe();
            if (validSession()) resolve();
            else reject(new ServerAccessError('cancelled'));
        });
    }).finally(() => { pending = null; });
    return pending;
}

// Called only for an explicit play, before reading any saved audio or prefetch URL.
export async function authorizeServerPlayback() {
    if (!serverAccessRequired()) return;
    if (validSession()) {
        try { await accessRequest('status'); return; }
        catch (error) {
            if (!(error instanceof ServerAccessError) || error.code !== 'unauthorized') throw error;
            useServerAccessStore.getState().save({ token: '', expiresAt: 0 });
        }
    }
    await askForAccess();
}

export async function authorizedServerAudio(id: string): Promise<string> {
    // Background prefetch must not open an authorization dialog.
    if (!validSession()) throw new ServerAccessError('unauthorized');
    const result = await accessRequest<{ path: string }>('source', { id });
    return new URL(result.path, new URL(api, window.location.href)).href;
}

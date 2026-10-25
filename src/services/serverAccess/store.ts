import { create } from 'zustand';
import { getStoredString, setStoredString } from '../../stores/storagePrimitives';

// Persist only the expiring session, never email addresses or verification codes.
type Session = { token: string; expiresAt: number };
const key = 'tingyu.server-access.v1';
const empty: Session = { token: '', expiresAt: 0 };
function restored(): Session {
    try {
        const value = JSON.parse(getStoredString(key, '{}')) as Session;
        return /^[\w-]{43}$/.test(value.token) && value.expiresAt > Date.now() ? value : empty;
    } catch { return empty; }
}
export const useServerAccessStore = create<Session & {
    open: boolean;
    setOpen: (open: boolean) => void;
    save: (session: Session) => void;
}>(set => ({
    ...restored(), open: false,
    setOpen: open => set({ open }),
    save: session => {
        try { setStoredString(key, JSON.stringify(session)); } catch { /* In-memory access still works. */ }
        set(session);
    },
}));

export function validSession() {
    const state = useServerAccessStore.getState();
    return state.token && state.expiresAt > Date.now() ? state.token : '';
}

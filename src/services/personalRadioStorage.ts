import type { UnifiedSong } from '../types';
import { getStoredString, setStoredString } from '../stores/storagePrimitives';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// Radio UI and the public library adapter share metadata only; audio URLs and credentials are never kept.
export const PERSONAL_LIBRARY_PROVIDER = 'hearttrace';
const KEY = 'personal_radio_collections_v1';
export type SavedRadio = { id: string; name: string; updatedAt: number; songs: UnifiedSong[] };
const listeners = new Set<() => void>();
let revision = 0;

function keepSong(value: unknown): UnifiedSong | null {
    if (!value || typeof value !== 'object') return null;
    const song = value as UnifiedSong;
    const ref = song.sourceRef;
    if (ref?.kind !== 'online' || typeof ref.providerId !== 'string' || typeof ref.mediaId !== 'string'
        || !ref.providerId || !ref.mediaId || typeof song.name !== 'string' || !song.album) return null;
    return {
        id: typeof song.id === 'string' || typeof song.id === 'number' ? song.id : ref.mediaId,
        name: song.name.slice(0, 300),
        artists: Array.isArray(song.artists) ? song.artists.map(artist => ({ id: artist.id, name: artist.name })) : [],
        album: { id: song.album.id, name: song.album.name, coverUrl: song.album.coverUrl },
        durationMs: Number.isFinite(song.durationMs) ? song.durationMs : 0,
        sourceRef: { kind: 'online', providerId: ref.providerId, mediaId: ref.mediaId, ...(ref.variant ? { variant: ref.variant } : {}) },
    };
}

export function readSavedRadios(): SavedRadio[] {
    try {
        const data: unknown = JSON.parse(getStoredString(KEY, '[]'));
        if (!Array.isArray(data)) return [];
        return data.slice(0, 24).flatMap(value => {
            if (!value || typeof value.id !== 'string' || !value.id.startsWith('radio:')
                || typeof value.name !== 'string' || !Array.isArray(value.songs)) return [];
            const songs = (value.songs as unknown[]).slice(0, 80).map(keepSong).filter((song): song is UnifiedSong => Boolean(song));
            return songs.length ? [{ id: value.id, name: value.name.slice(0, 120), updatedAt: Number(value.updatedAt) || 0, songs }] : [];
        });
    } catch { return []; }
}

export function savePersonalRadio(name: string, songs: UnifiedSong[], previousId?: string): SavedRadio {
    const unique = new Map<string, UnifiedSong>();
    for (const candidate of songs) {
        const song = keepSong(candidate);
        if (song) unique.set(getPlaybackSongKey(song), song);
    }
    if (!unique.size) throw new Error('No online tracks to save');
    const radio = {
        id: previousId || `radio:${crypto.randomUUID()}`,
        name: name.trim().slice(0, 120), updatedAt: Date.now(), songs: [...unique.values()].slice(0, 80),
    };
    // Write before notifying: quota errors must not be shown as a successful save.
    setStoredString(KEY, JSON.stringify([radio, ...readSavedRadios().filter(item => item.id !== radio.id)].slice(0, 24)));
    revision += 1;
    listeners.forEach(listener => listener());
    return radio;
}

export const subscribeSavedRadios = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
export const getSavedRadiosRevision = () => revision;

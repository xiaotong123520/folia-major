import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSavedRadios, savePersonalRadio } from '../../src/services/personalRadioStorage';
import type { UnifiedSong } from '../../src/types';

// Saved stations keep recording identities across reloads without caching playback URLs or credentials.
let data: Map<string, string>;
beforeEach(() => {
    data = new Map();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
const song = (providerId: string, mediaId = 'same-id'): UnifiedSong => ({
    id: mediaId, name: 'Same title', artists: [], album: { id: 'album', name: 'Album', coverUrl: 'https://example.com/cover.jpg' },
    durationMs: 1000, sourceRef: { kind: 'online', providerId, mediaId },
});

describe('personal radio collections', () => {
    it('preserves different source identities and ordered deduplication after reading storage again', () => {
        const saved = savePersonalRadio('My station', [song('first'), song('second'), song('first')]);
        const restored = readSavedRadios();
        expect(restored[0].id).toBe(saved.id);
        expect(restored[0].songs.map(track => track.sourceRef.kind === 'online' ? track.sourceRef.providerId : '')).toEqual(['first', 'second']);
    });
    it('updates a saved card rather than duplicating it', () => {
        const first = savePersonalRadio('Station', [song('first')]);
        savePersonalRadio('Updated station', [song('second')], first.id);
        expect(readSavedRadios()).toHaveLength(1);
        expect(readSavedRadios()[0].name).toBe('Updated station');
        expect(readSavedRadios()[0].songs[0].sourceRef).toMatchObject({ providerId: 'second' });
    });
    it('does not store temporary audio URLs, raw provider data or credentials', () => {
        const input = { ...song('first'), audioUrl: 'https://example.com/private?token=secret', raw: { cookie: 'private' } };
        savePersonalRadio('Station', [input]);
        const value = [...data.values()][0];
        expect(value).not.toContain('token');
        expect(value).not.toContain('cookie');
        expect(value).not.toContain('audioUrl');
    });
    it('ignores malformed storage and reports write errors instead of pretending to save', () => {
        data.set('personal_radio_collections_v1', '{broken');
        expect(readSavedRadios()).toEqual([]);
        vi.stubGlobal('localStorage', { getItem: () => '[]', setItem: () => { throw new Error('quota'); } });
        expect(() => savePersonalRadio('Station', [song('first')])).toThrow('quota');
    });
});

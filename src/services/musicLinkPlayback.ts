import type { UnifiedSong } from '../types';
import type { MusicLinkResolution } from './musicLinkResolver';
import { omni } from './onlineMusic/omni';

// Explicit cross-provider fallback: retain the exact source and ID, never substitute a recording by title.
export async function findSharedMusicSong(link: MusicLinkResolution): Promise<UnifiedSong | null> {
    if (link.kind !== 'track' || !link.resourceId) return null;
    let originalFailure: unknown;
    try {
        if (link.access === 'existing-provider-adapter') {
            const song = await omni.getSongDetail(link.platform, link.resourceId);
            if (song && (await omni.getAudioSource(song, 'standard'))?.url) return song;
        }
    } catch (error) {
        originalFailure = error;
    }
    const backend = omni.getProviderSummaries().find(item => item.providerId === 'music-backend');
    if (backend?.availability.configured) {
        const expectedId = `${link.platform}:${link.resourceId}`;
        let song = await omni.getSongDetail('music-backend', expectedId);
        // go-music-api also supports share links in its search endpoint. ID-only keyword search
        // can be empty even when the actual shared track is indexed by the backend.
        if (!song && link.normalizedUrl) {
            const page = await omni.searchProviderSongs('music-backend', link.normalizedUrl, { limit: 30, offset: 0 });
            const matches = page.items.filter(item =>
                item.sourceRef?.kind === 'online'
                && item.sourceRef.providerId === 'music-backend'
                && item.sourceRef.mediaId === expectedId,
            );
            if (matches.length === 1) song = matches[0];
        }
        if (song && (await omni.getAudioSource(song, 'standard'))?.url) return song;
    }
    if (originalFailure) throw originalFailure;
    return null;
}

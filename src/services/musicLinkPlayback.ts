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
        const song = await omni.getSongDetail('music-backend', `${link.platform}:${link.resourceId}`);
        if (song && (await omni.getAudioSource(song, 'standard'))?.url) return song;
    }
    if (originalFailure) throw originalFailure;
    return null;
}

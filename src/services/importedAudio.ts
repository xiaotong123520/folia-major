/** Browser-only audio imports. Files and playable URLs never pass through our backend. */
export const AUDIO_EXTENSIONS = /\.(?:mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i;

export interface ImportedAudioTrack {
    id: string;
    name: string;
    url: string;
    /** Blob URLs belong to this session only and must be revoked on removal/unmount. */
    temporary: boolean;
    /** Optional stream URLs to try if the primary URL fails to load. */
    fallbackUrls?: string[];
}

export function isPlayableAudioFile(file: Pick<File, 'name' | 'type'>): boolean {
    return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);
}

export function validatePlayableUrl(input: string, secureContext = true): string | null {
    if (!input.trim() || input.length > 4096) return null;
    try {
        const url = new URL(input.trim());
        if (url.username || url.password || url.hash) return null;
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !secureContext)) return null;
        return url.href;
    } catch {
        return null;
    }
}

export function audioDisplayName(url: string): string {
    try {
        const path = new URL(url).pathname.split('/').filter(Boolean).pop();
        if (!path) return '网络音乐';
        let name = path;
        try { name = decodeURIComponent(path); } catch { /* retain original filename */ }
        return name.replace(AUDIO_EXTENSIONS, '').slice(0, 120) || '网络音乐';
    } catch {
        return '网络音乐';
    }
}

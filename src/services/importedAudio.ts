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

/** Mobile Files pickers can supply an MP3/M4A as an untyped octet-stream.
 * Keep the original bytes and filename, but attach the appropriate media MIME
 * before creating a blob URL or saving to IndexedDB. Never transcode the bytes. */
export function normalizeImportedAudioFile(file: File): File {
    const suffix = file.name.split('.').pop()?.toLowerCase() ?? '';
    const types: Record<string, string> = {
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        aac: 'audio/aac',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        opus: 'audio/ogg',
        flac: 'audio/flac',
        webm: 'audio/webm',
    };
    const mime = types[suffix];
    if (!mime || (file.type.startsWith('audio/') && file.type !== 'audio/*')) return file;
    return new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

export function describeAudioPlaybackFailure(code?: number, isLocalFile = false): string {
    if (isLocalFile) {
        if (code === 4) return '手机无法解码这个音频，建议导入 MP3 或 AAC 编码的 M4A 文件。加密或无损文件可能不受支持。';
        if (code === 3) return '音频解码失败，文件可能损坏或编码不受浏览器支持。';
        return '本地音乐没有成功播放。请展开播放器，直接点击播放；若仍失败，请尝试 MP3 或 M4A。';
    }
    return '在线音频无法播放：接口可能返回网页、无权限、跨域不可读的 JSON 或已过期的地址。';
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

import { describe, expect, it } from 'vitest';
import { audioDisplayName, isPlayableAudioFile, normalizeImportedAudioFile, describeAudioPlaybackFailure, validatePlayableUrl } from '../../src/services/importedAudio';

describe('browser audio imports', () => {
    it('accepts known audio extensions when iOS does not provide a MIME type', () => {
        expect(isPlayableAudioFile({ name: 'Rainy Night.m4a', type: '' })).toBe(true);
        expect(isPlayableAudioFile({ name: 'demo.flac', type: '' })).toBe(true);
        expect(isPlayableAudioFile({ name: 'recording', type: 'audio/mpeg' })).toBe(true);
        expect(isPlayableAudioFile({ name: 'index.html', type: 'text/html' })).toBe(false);
    });

    it('preserves mobile local bytes while assigning audio MIME to untyped .MP3 and .m4a', async () => {
        const mp3 = new File(['sample-bytes'], 'Demo.MP3', { type: 'application/octet-stream' });
        const normalized = normalizeImportedAudioFile(mp3);
        expect(normalized.type).toBe('audio/mpeg');
        expect(normalized.name).toBe(mp3.name);
        expect(await normalized.text()).toBe('sample-bytes');

        const m4a = new File(['m4a-bytes'], 'Song.m4a');
        const tagged = normalizeImportedAudioFile(m4a);
        expect(tagged.type).toBe('audio/mp4');
        expect(await tagged.text()).toBe('m4a-bytes');
    });

    it('keeps already typed files untouched and distinguishes unsupported local codecs', () => {
        const typed = new File(['abc'], 'track.mp3', { type: 'audio/mpeg' });
        expect(normalizeImportedAudioFile(typed)).toBe(typed);
        expect(describeAudioPlaybackFailure(4, true)).toContain('MP3');
        expect(describeAudioPlaybackFailure(4, true)).not.toContain('JSON');
        expect(describeAudioPlaybackFailure(4, false)).toContain('在线音频');
    });

    it('allows HTTPS streaming URLs with signed query strings', () => {
        const url = 'https://media.example.com/stream?signature=abc&expires=123';
        expect(validatePlayableUrl(url)).toBe(url);
        expect(validatePlayableUrl(' https://music.example.com/clip.mp3 ')).toBe('https://music.example.com/clip.mp3');
    });

    it('rejects unsafe schemes, embedded credentials and insecure HTTP on Pages', () => {
        expect(validatePlayableUrl('javascript:alert(1)')).toBeNull();
        expect(validatePlayableUrl('file:///private/song.mp3')).toBeNull();
        expect(validatePlayableUrl('https://person:password@media.example.com/a.mp3')).toBeNull();
        expect(validatePlayableUrl('http://media.example.com/a.mp3')).toBeNull();
        expect(validatePlayableUrl('https://media.example.com/a.mp3#fragment')).toBeNull();
        expect(validatePlayableUrl('not a URL')).toBeNull();
    });

    it('shows a friendly title from the direct audio URL', () => {
        expect(audioDisplayName('https://media.example.com/music/Rain%20Song.mp3?sig=1')).toBe('Rain Song');
        expect(audioDisplayName('https://media.example.com/stream')).toBe('stream');
    });
});

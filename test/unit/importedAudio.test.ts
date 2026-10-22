import { describe, expect, it } from 'vitest';
import { audioDisplayName, isPlayableAudioFile, validatePlayableUrl } from '../../src/services/importedAudio';

describe('browser audio imports', () => {
    it('accepts known audio extensions when iOS does not provide a MIME type', () => {
        expect(isPlayableAudioFile({ name: 'Rainy Night.m4a', type: '' })).toBe(true);
        expect(isPlayableAudioFile({ name: 'demo.flac', type: '' })).toBe(true);
        expect(isPlayableAudioFile({ name: 'recording', type: 'audio/mpeg' })).toBe(true);
        expect(isPlayableAudioFile({ name: 'index.html', type: 'text/html' })).toBe(false);
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

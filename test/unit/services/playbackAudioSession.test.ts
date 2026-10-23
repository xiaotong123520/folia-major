import { describe, expect, it, vi } from 'vitest';
import { claimPlaybackAudioSession, installPlaybackContextRecovery, needsPlaybackContextResume } from '../../../src/services/playbackAudioSession';

// Background recovery must not override pause commands, replace tracks, or fight another audio app.
function fixture() {
    const page = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
    page.visibilityState = 'visible';
    const view = new EventTarget();
    const context = { state: 'interrupted', resume: vi.fn(async () => {}) };
    const audio = { paused: false, ended: false };
    let current: typeof context | null = context;
    const dispose = installPlaybackContextRecovery({
        getContext: () => current, getAudio: () => audio,
        page: page as unknown as Document, view: view as unknown as Window,
    });
    return { page, view, context, audio, dispose, replaceContext: () => { current = null; } };
}
describe('browser playback audio session', () => {
    it('requests music playback only when the browser supports it', () => {
        expect(claimPlaybackAudioSession({})).toBe(false);
        const session = { type: 'auto' };
        expect(claimPlaybackAudioSession({ audioSession: session })).toBe(true);
        expect(session.type).toBe('playback');
        expect(claimPlaybackAudioSession({ audioSession: session })).toBe(true);
    });
    it.each(['suspended', 'interrupted'])('recognizes the resumable %s state', state => {
        expect(needsPlaybackContextResume({ state, resume: async () => {} })).toBe(true);
    });
    it.each(['running', 'closed'])('does not resume a %s graph', state => {
        expect(needsPlaybackContextResume({ state, resume: async () => {} })).toBe(false);
    });
    it('repairs still-playing audio on foreground return and coalesces duplicate notifications', async () => {
        const host = fixture();
        host.page.dispatchEvent(new Event('visibilitychange'));
        host.view.dispatchEvent(new Event('focus'));
        await Promise.resolve();
        expect(host.context.resume).toHaveBeenCalledTimes(1);
        host.dispose();
    });
    it.each(['paused', 'ended', 'hidden'])('does not restart %s playback', async condition => {
        const host = fixture();
        if (condition === 'hidden') host.page.visibilityState = 'hidden';
        else host.audio[condition as 'paused' | 'ended'] = true;
        host.page.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
        expect(host.context.resume).not.toHaveBeenCalled();
        host.dispose();
    });
    it.each(['pause', 'unmount', 'replace'])('honors a %s arriving before the asynchronous resume', async action => {
        const host = fixture();
        host.view.dispatchEvent(new Event('pageshow'));
        if (action === 'pause') host.audio.paused = true;
        if (action === 'unmount') host.dispose();
        if (action === 'replace') host.replaceContext();
        await Promise.resolve();
        expect(host.context.resume).not.toHaveBeenCalled();
        host.dispose();
    });
});

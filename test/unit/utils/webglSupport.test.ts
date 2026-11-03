import { afterEach, describe, expect, it, vi } from 'vitest';

// GPU detection must tolerate SSR, disabled graphics, and driver failures.
afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('supportsWebGL2', () => {
    it('returns false without a browser document', async () => {
        const { supportsWebGL2 } = await import('../../../src/utils/webglSupport');
        expect(supportsWebGL2()).toBe(false);
    });

    it('returns false when the browser disables WebGL', async () => {
        vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
        const { supportsWebGL2 } = await import('../../../src/utils/webglSupport');
        expect(supportsWebGL2()).toBe(false);
    });

    it('contains context creation failures', async () => {
        vi.stubGlobal('document', { createElement: () => ({ getContext: () => { throw new Error('driver'); } }) });
        const { supportsWebGL2 } = await import('../../../src/utils/webglSupport');
        expect(supportsWebGL2()).toBe(false);
    });

    it('releases the probe context and caches success', async () => {
        const loseContext = vi.fn();
        const getContext = vi.fn(() => ({ isContextLost: () => false, getExtension: () => ({ loseContext }) }));
        vi.stubGlobal('document', { createElement: () => ({ getContext }) });
        const { supportsWebGL2 } = await import('../../../src/utils/webglSupport');
        expect(supportsWebGL2()).toBe(true);
        expect(supportsWebGL2()).toBe(true);
        expect(getContext).toHaveBeenCalledTimes(1);
        expect(loseContext).toHaveBeenCalledTimes(1);
    });
});

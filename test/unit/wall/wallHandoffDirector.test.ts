import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleWallHandoffViewChange } from '../../../src/components/app/presentation/wallHandoffDirector';
import { needsRecull } from '../../../src/library/suites/bravais/useBravaisCamera';
import { useWallHandoffStore } from '../../../src/stores/useWallHandoffStore';

// Phone transitions must not retain a second cover wall or initialize a handoff session.
afterEach(() => {
    useWallHandoffStore.getState().abort();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('phone wall navigation', () => {
    it('skips handoffs in both directions even when the home peer supports them', () => {
        vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
        const canHandoff = vi.fn(() => true);
        const previous = useWallHandoffStore.getState().homePeer;
        useWallHandoffStore.setState({ homePeer: { canHandoff, seeThrough: () => false, reduced: () => false } });
        try {
            handleWallHandoffViewChange('home', 'lattice');
            expect(useWallHandoffStore.getState().session).toBeNull();
            expect(canHandoff).not.toHaveBeenCalled();
            handleWallHandoffViewChange('lattice', 'home');
            expect(useWallHandoffStore.getState().session).toBeNull();
        } finally {
            useWallHandoffStore.setState({ homePeer: previous });
        }
    });

    it('still aborts an ongoing desktop handoff if navigation changes after resizing', () => {
        const store = useWallHandoffStore.getState();
        store.begin({ direction: 'to-lattice', mode: 'flip', seeThrough: false,
            timing: { waveMs: 780, fadeMs: 180, openMs: 400, closeTimeoutMs: 1200, waitTimeoutMs: 1600 } });
        vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
        handleWallHandoffViewChange('lattice', 'home');
        expect(useWallHandoffStore.getState().session).toBeNull();
    });
});

it('reculls before a phone pan exhausts its smaller cover buffer', () => {
    const bounds = { left: 0, top: 0, right: 390, bottom: 844 };
    expect(needsRecull({ ...bounds, right: 471 }, bounds, 240)).toBe(true);
    expect(needsRecull({ ...bounds, right: 469 }, bounds, 240)).toBe(false);
    expect(needsRecull({ ...bounds, right: 471 }, bounds)).toBe(false);
});

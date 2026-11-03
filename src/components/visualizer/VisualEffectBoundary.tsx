import React from 'react';

// Keep a failed visual effect from unmounting the player and the rest of the app.
export default class VisualEffectBoundary extends React.Component<{
    children: React.ReactNode;
    fallback: React.ReactNode;
}, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error) {
        console.warn('[VisualEffectBoundary] Using compatible fallback', error);
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

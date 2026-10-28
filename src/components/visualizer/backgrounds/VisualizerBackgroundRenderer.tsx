import React from 'react';
import { DEFAULT_VISUALIZER_BACKGROUND_MODE, getVisualizerBackgroundRegistryEntry } from './registry';
import type { VisualizerBackgroundRenderProps } from './definition';
import { supportsWebGL2 } from '../../../utils/webglSupport';
import VisualEffectBoundary from '../VisualEffectBoundary';

// src/components/visualizer/backgrounds/VisualizerBackgroundRenderer.tsx
// Selects the active shell background through the discoverable background registry.

const BackgroundEffect: React.FC<VisualizerBackgroundRenderProps> = (props) => (
    getVisualizerBackgroundRegistryEntry(props.config?.mode ?? DEFAULT_VISUALIZER_BACKGROUND_MODE).render(props)
);

const VisualizerBackgroundRenderer: React.FC<VisualizerBackgroundRenderProps> = (props) => {
    if (props.config?.transparent) {
        return null;
    }

    const mode = props.config?.mode ?? DEFAULT_VISUALIZER_BACKGROUND_MODE;
    const fallback = <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{
        background: `radial-gradient(ellipse at top, ${props.theme.secondaryColor}, ${props.theme.backgroundColor})`,
    }} />;
    if ((mode === 'latent' || mode === 'nomand') && !supportsWebGL2()) return fallback;
    return (
        <VisualEffectBoundary key={mode} fallback={fallback}>
            <BackgroundEffect {...props} />
        </VisualEffectBoundary>
    );
};

export default VisualizerBackgroundRenderer;

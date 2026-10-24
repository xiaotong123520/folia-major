// Detect GPU availability once without retaining an extra drawing context.
let supported: boolean | undefined;

export const supportsWebGL2 = (): boolean => {
    if (supported !== undefined) return supported;
    if (typeof document === 'undefined') return false;
    try {
        const gl = document.createElement('canvas').getContext('webgl2');
        supported = Boolean(gl && !gl.isContextLost());
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
        supported = false;
    }
    return supported;
};

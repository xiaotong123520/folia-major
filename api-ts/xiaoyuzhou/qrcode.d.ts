declare module 'qrcode' {
    const qr: { toDataURL(text: string, options?: { width?: number; margin?: number }): Promise<string> };
    export default qr;
}

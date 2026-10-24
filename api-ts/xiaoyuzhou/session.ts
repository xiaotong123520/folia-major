import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Encrypted HttpOnly sessions keep platform credentials out of the client and logs.
const SESSION = '__Secure-tingyu-podcast';
const PENDING = '__Secure-tingyu-podcast-qr';
function secret() {
    const value = process.env.PODCAST_SESSION_SECRET || process.env.QQ_SESSION_SECRET;
    if (!value || value.length < 32) throw new Error('Podcast login is not configured');
    return createHash('sha256').update('tingyu-podcast-v1\0' + value).digest();
}
export function seal(value: unknown, ttl: number): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', secret(), nonce);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ value, expires: Date.now() + ttl * 1000 })), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function unseal(value: string): any {
    try {
        const packed = Buffer.from(value, 'base64url');
        const decipher = createDecipheriv('aes-256-gcm', secret(), packed.subarray(0, 12));
        decipher.setAuthTag(packed.subarray(12, 28));
        const data = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString());
        return data.expires > Date.now() ? data.value : null;
    } catch { return null; }
}
export function readCookie(req: any, pending = false) {
    const name = pending ? PENDING : SESSION;
    const value = String(req.headers.cookie || '').split(';').map(row => row.trim()).find(row => row.startsWith(name + '='));
    return value ? unseal(value.slice(name.length + 1)) : null;
}
export function setCookie(res: any, value: unknown, pending = false) {
    const ttl = value ? (pending ? 300 : 14 * 86400) : 0;
    const cookie = `${pending ? PENDING : SESSION}=${value ? seal(value, ttl) : ''}; Path=/api/podcast; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Strict`;
    const previous = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : previous ? [previous] : []), cookie]);
}

// worker/apple-music-token.ts
// Signs a short-lived Apple Music developer token inside the Cloudflare Worker without exposing the private key.
type AppleTokenEnv = {
    APPLE_MUSICKIT_TEAM_ID?: string;
    APPLE_MUSICKIT_KEY_ID?: string;
    APPLE_MUSICKIT_PRIVATE_KEY?: string;
};

const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
};

const base64url = (value: string | Uint8Array): string => {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const decodePrivateKey = (pem: string): Uint8Array => {
    const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s/g, '');
    const binary = atob(body);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
};

export async function handleAppleMusicToken(request: Request, env: AppleTokenEnv): Promise<Response> {
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
    }
    const teamId = env.APPLE_MUSICKIT_TEAM_ID?.trim();
    const keyId = env.APPLE_MUSICKIT_KEY_ID?.trim();
    const privateKeyValue = env.APPLE_MUSICKIT_PRIVATE_KEY;
    if (!teamId || !keyId || !privateKeyValue) {
        return new Response(JSON.stringify({
            error: 'Apple Music is not configured yet. Add APPLE_MUSICKIT_TEAM_ID, APPLE_MUSICKIT_KEY_ID, and APPLE_MUSICKIT_PRIVATE_KEY as server-side secrets.',
            code: 'APPLE_MUSICKIT_NOT_CONFIGURED',
        }), { status: 503, headers });
    }
    try {
        const now = Math.floor(Date.now() / 1000);
        const signingInput = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }))
            + '.' + base64url(JSON.stringify({ iss: teamId, iat: now, exp: now + 60 * 60 * 24 * 30 }));
        const pem = privateKeyValue.replace(/\\n/g, '\n');
        const key = await crypto.subtle.importKey(
            'pkcs8',
            decodePrivateKey(pem),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign'],
        );
        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            new TextEncoder().encode(signingInput),
        );
        return new Response(JSON.stringify({
            token: signingInput + '.' + base64url(new Uint8Array(signature)),
            expiresAt: now + 60 * 60 * 24 * 30,
        }), { status: 200, headers });
    } catch (error) {
        console.error('[AppleMusic] Cloudflare developer token signing failed:', error);
        return new Response(JSON.stringify({
            error: 'Apple Music developer token could not be created.',
            code: 'APPLE_MUSICKIT_TOKEN_ERROR',
        }), { status: 500, headers });
    }
}

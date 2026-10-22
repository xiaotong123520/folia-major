import { createSign, createPrivateKey } from "node:crypto";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
};

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export default async function handler(req: Request) {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers });
  }

  const teamId = process.env.APPLE_MUSICKIT_TEAM_ID?.trim();
  const keyId = process.env.APPLE_MUSICKIT_KEY_ID?.trim();
  const privateKeyValue = process.env.APPLE_MUSICKIT_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKeyValue) {
    return new Response(JSON.stringify({
      error: "Apple Music is not configured yet. Add APPLE_MUSICKIT_TEAM_ID, APPLE_MUSICKIT_KEY_ID, and APPLE_MUSICKIT_PRIVATE_KEY in the server environment.",
      code: "APPLE_MUSICKIT_NOT_CONFIGURED",
    }), { status: 503, headers });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
    const payload = base64url(JSON.stringify({ iss: teamId, iat: now, exp: now + 60 * 60 * 24 * 30 }));
    const signingInput = header + "." + payload;
    const signer = createSign("SHA256");
    signer.update(signingInput);
    signer.end();
    const key = createPrivateKey(privateKeyValue.replace(/\\n/g, "\n"));
    const signature = signer.sign({ key, dsaEncoding: "ieee-p1363" });
    const token = signingInput + "." + base64url(signature);
    return new Response(JSON.stringify({ token, expiresAt: now + 60 * 60 * 24 * 30 }), { status: 200, headers });
  } catch (error) {
    console.error("Apple Music developer token signing failed:", error instanceof Error ? error.message : "unknown error");
    return new Response(JSON.stringify({ error: "Apple Music developer token could not be created.", code: "APPLE_MUSICKIT_TOKEN_ERROR" }), { status: 500, headers });
  }
}

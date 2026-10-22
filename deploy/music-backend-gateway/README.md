# Folia private music backend gateway

This stack keeps the upstream Go API off host-published ports. Only the gateway is published, bound to `127.0.0.1:8090`; put your Baota/Nginx/Caddy HTTPS reverse proxy in front of that loopback port. The gateway requires a Bearer token and only forwards a small read-only endpoint allowlist. It intentionally does not expose cookie management, QR login, system configuration, Swagger, or arbitrary proxy targets.

## Deploy

1. On the server, copy `.env.example` to `.env` and replace the sample with a unique random secret of at least 32 bytes. Never commit or send the secret in chat.
2. Create a server-local `cookies.json` (for example `{}`) and set restrictive permissions such as `chmod 600 cookies.json`. If you do not need authenticated provider access, keep it empty. Never commit it.
3. Run `docker compose up -d --build` from this directory.
4. Confirm `curl http://127.0.0.1:8090/healthz` returns `ok`.
5. In Baota, create an HTTPS site for a dedicated API subdomain and reverse proxy it to `http://127.0.0.1:8090`. Enable TLS, disable caching for API responses, and do not expose port 8080. The gateway must remain reachable only through HTTPS from the public internet.
6. From an authorized shell, test that a request without a token returns 401 and a request with the secret returns an allowed endpoint response. Do not paste the token into tickets, source files, or browser-side environment variables.
7. In Vercel Preview (not Production yet), configure server-only `MUSIC_BACKEND_UPSTREAM_URL=https://your-api-subdomain.example`, `MUSIC_BACKEND_UPSTREAM_API_KEY` with the same secret, and `FOLIA_ALLOWED_ORIGINS` with the exact Folia preview origin. Set public `VITE_MUSIC_BACKEND_BASE_URL=/api/music-backend`. Rebuild the preview.
8. Only after search, lyrics, Range/206 streaming, and mobile Safari playback pass should you consider the production environment.

## Security boundaries

- The gateway only permits GET/HEAD and exact path allowlisting. It does not forward browser cookies or arbitrary Authorization headers to the upstream.
- The upstream container has no published host port; only the gateway container can reach it on the private Docker network.
- The bearer key is required at startup for health to report ready. Use a strong random value and rotate it if exposed.
- Rate limiting is process-local; retain a Baota/Nginx or edge-level rate limit for production.
- The upstream project is AGPL-3.0 and its built-in cookie/QR-login routes are not protected by the stock router. Do not expose the upstream container directly. Review the license and platform terms before any hosted use.
- This gateway is an access-control layer, not permission to bypass DRM, paywalls, or provider membership checks. Playback is only expected for resources the user is authorized to access.

# Folia Music Backend: integration and deployment guide

## Status

This branch contains an optional Folia provider adapter, a bounded HTTP client, unit tests for the client, and this guide. It has not yet been built or run in CI in this session. Do not merge or deploy until the repository checks pass and a real authorized playback smoke test succeeds.

## Files added or updated

- `src/services/onlineMusic/musicBackendClient.ts`: bounded JSON transport, HTTPS enforcement, request timeout/cancellation, endpoint validation and size limits.
- `src/services/onlineMusic/musicBackendProvider.ts`: maps the candidate API's search and lyrics response into Folia's provider contract; uses the backend stream endpoint for audio.
- `src/services/onlineMusic/providerRegistry.ts`: registers the optional provider. It reports not configured until the base URL is set.
- `api-ts/music-backend-proxy.ts`: same-origin, read-only allowlist proxy for search, lyrics, stream, inspect/switch, album and playlist detail. It forwards Range headers and selected audio response headers; it does not expose cookie/QR-login routes.
- `vercel.json`: routes `/api/music-backend/*` to the allowlisted proxy.
- `test/unit/musicBackendClient.test.ts`: transport validation tests.
- `.env.example`: optional public backend URL.
- `docs/music-backend-evaluation.md`: candidate and security review.

## Configure for local development

1. Copy `.env.example` to `.env.local` in your local checkout.
2. For direct local development, set `VITE_MUSIC_BACKEND_BASE_URL` to a locally running, hardened backend, for example `http://127.0.0.1:8090`. For a Vercel deployment, set it to the Folia site's same-origin proxy base, e.g. `https://your-folia-domain.example/api/music-backend`.
3. Restart the Vite development server after changing environment variables.
4. Keep the value empty to leave the provider unavailable.
5. Do not put cookies, API secrets, private keys, or bearer tokens in any `VITE_*` variable. Vite variables are delivered to the browser.

## Production requirements

The browser adapter uses the same-origin Vercel proxy when `VITE_MUSIC_BACKEND_BASE_URL` points at `/api/music-backend`. Set these server-side Vercel environment variables:

- `MUSIC_BACKEND_UPSTREAM_URL`: URL of the private, hardened music API. Prefer an internal/private address; the proxy accepts remote HTTPS URLs only.
- `FOLIA_ALLOWED_ORIGINS`: comma-separated exact origin(s), e.g. `https://your-folia-domain.example`.

Do not prefix either server variable with `VITE_`. The proxy is read-only and has a best-effort per-IP rate limit, but in-memory limits are not a substitute for a durable edge/WAF rate limit. Before production use, the upstream must be configured so public requests cannot read or alter platform cookies, initiate QR login, or access administrative configuration.

The stock `go-music-api` router currently mounts cookie read/write and QR-login routes without visible route-level authentication, and uses permissive CORS. Do not expose the stock service directly to the internet. The Folia proxy does not expose those management routes, but the upstream must still be private or independently hardened. Minimum acceptable deployment design:

- Run it on a private network or bind it to loopback behind a gateway.
- Allowlist only the Folia web origin at the gateway; do not combine wildcard origin with credentialed CORS.
- Block `/api/v1/system/cookies`, `/music/cookies`, and QR-login management routes from public access unless protected by a separate administrator authentication layer.
- Do not put provider cookies in query parameters, browser storage, logs, analytics, or issue reports.
- Add per-IP/user rate limits, response size limits, timeouts, and monitoring.
- Validate any URL accepted by cover/stream proxy routes to prevent SSRF; only allow approved upstream hostnames and HTTP(S).
- Do not expose Swagger or diagnostics to untrusted users unless explicitly intended.
- Use TLS for public deployments. The client rejects remote plain HTTP.
- Review AGPL-3.0 obligations before distributing modified versions or offering a modified network service.

## Supported adapter behavior and limits

- Search calls `GET /api/v1/music/search?q=...` and expects the documented `{code, data: {songs: [...]}}` response shape.
- Lyrics calls `GET /api/v1/music/lyric?id=...&source=...` and reads `data.lyric`.
- Playback returns the backend's `/api/v1/music/stream` URL. The upstream service documents Range support; this still requires real browser testing for HTTP 206, content type, CORS, and iOS Safari.
- Exact detail lookup is conservative: it searches by ID and accepts only a matching ID. If the backend does not return an exact match, it returns no detail rather than guessing.
- Playlist/album browsing, account login, likes, and playlist mutations are deliberately disabled in this adapter.
- Quality preference is passed through Folia's contract but the candidate stream endpoint may not honor all quality levels. Do not advertise lossless/Hi-Res without verifying actual stream metadata.
- Search results may include restricted or unavailable tracks. A returned row does not imply that playback is authorized or that the stream will work.

## Validation before merge

From a checkout of this branch:

```bash
npm ci
npm run typecheck
npm run test:unit -- test/unit/musicBackendClient.test.ts
npm run build
```

Then test with a secured backend using a track that is publicly playable or authorized for the account:

- search and pagination do not crash on missing optional fields;
- audio response supports Range requests and returns 206/Content-Range when requested;
- expired URL and 401/403/404/429/5xx responses are shown as unavailable/restricted instead of silently substituting a different recording;
- lyrics missing returns an empty result without crashing;
- iPhone Safari can play, pause, seek, and change tracks;
- local music and Navidrome continue to work unchanged.

Do not merge until typecheck, unit tests, build, and smoke tests pass.

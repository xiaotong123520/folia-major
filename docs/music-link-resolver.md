# Folia music link resolver

## Scope

This first stage adds deterministic, network-free classification of music share links. It does not fetch remote pages, extract protected audio, log into accounts, or grant subscription access.

Entry point: `src/services/musicLinkResolver.ts`
Unit tests: `test/unit/musicLinkResolver.test.ts`

## Recognized sources

| Source | Recognition | Playback route |
| --- | --- | --- |
| NetEase Cloud Music | Share URL and common resource ID | Existing provider; runtime availability still applies |
| QQ Music | Share URL and common resource ID | Existing provider; runtime availability still applies |
| Kugou | Share URL and common resource ID | Existing provider; runtime availability still applies |
| Kuwo | URL recognition | Recognition only; provider implementation needed |
| Apple Music | Share URL and common song ID | Official MusicKit flow required; subscription and developer-token constraints remain |
| YouTube / YouTube Music | Video ID | Official player/embed route; no protected-stream extraction |
| SoundCloud | Share URL | Official embed or authorized API |
| Direct audio | Common media extension | Trusted, permitted URL only |
| Navidrome/Subsonic | Likely API endpoint | Configure a trusted server in Folia settings |

## Important distinction

A recognized link does not prove Folia can play it. A provider can still reject content that is removed, region-restricted, requires sign-in, or is not included in the user's subscription.

## Safety

- Only HTTP(S) URLs are accepted; URLs with embedded credentials are rejected.
- This classifier makes no network requests and cannot itself cause SSRF.
- Do not add a backend endpoint that fetches arbitrary user URLs. If remote metadata is fetched later, allowlist hosts, validate redirects and resolved IPs, and enforce timeouts and response-size limits.
- Never commit cookies, private keys, developer tokens, or passwords.
- Existing local music and Navidrome data must remain untouched.

## Next integration stages

1. Wire this resolver into a paste-link UI with platform and availability status.
2. Use existing NetEase/QQ/Kugou provider methods instead of duplicating provider logic.
3. Implement and test Kuwo only after confirming API/auth requirements and permitted playback.
4. Complete Apple Music using official MusicKit and server-side token signing.
5. Verify official YouTube/SoundCloud playback on iOS Safari and desktop.
6. Run unit tests, typecheck, and production build in CI before merge.
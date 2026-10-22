# Folia music link resolver

## Scope

This first stage adds deterministic, network-free classification of music share links. It does not fetch remote pages, extract protected audio, log into accounts, or grant subscription access.

Entry point: `src/services/musicLinkResolver.ts`
Unit tests: `test/unit/musicLinkResolver.test.ts`

This module is a standalone classification stage, not yet connected to the paste-link UI or playback queue. `isRecognizedMusicLink` answers whether a provider is known; `isSupportedMusicLink` answers whether this resolver reports an available playback route. Neither function proves that a specific song is playable.

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

## Current fixes

- NetEase `#/song?id=...` fragments are preserved in `normalizedUrl`, so the canonicalized link retains the song ID.
- Apple Music album and artist IDs are read from the final numeric path segment when no `i` track parameter exists.
- Recognition and playback support are separate predicates: a Kuwo URL is recognized but is not advertised as playable until a provider is implemented.
- Unit tests cover the preserved NetEase fragment and the recognition-versus-playback distinction.

## Next integration stages

1. Resolve the architecture review before merge: provider-specific rules must remain in provider adapters or be exposed as Omni capabilities, not create a shared platform-specific exception.
2. Wire the resolver into a paste-link UI with platform and availability status.
3. Use existing NetEase/QQ/Kugou provider methods instead of duplicating provider logic.
4. Implement and test Kuwo only after confirming API/auth requirements and permitted playback.
5. Complete Apple Music using official MusicKit and server-side token signing.
6. Verify official YouTube/SoundCloud playback on iOS Safari and desktop.
7. Run unit tests, typecheck, and production build in CI before merge.
## Folia UI integration (feature/ai-radio-agent-v1)

- `src/components/app/MusicLinkImport.tsx` displays a paste-link form and the network-free classification result.
- `src/App.tsx` exposes the browser-only `链接解析` launcher.
- Track links whose provider has an existing Folia adapter and a resource ID may call `omni.getSongDetail(providerId, resourceId)`; playback handoff uses the existing `handleSearchResultPlay` callback, never a second player.
- Platform links without an implemented adapter open the official source page. This import UI does **not** extract paid streams, automatically unlock subscriptions, support shortlinks requiring network redirect, or guarantee playable media.
- Apple Music requires valid MusicKit developer credentials for playback. Other providers require their configured account and API access.
- Tests in `test/unit/musicLinkResolver.test.ts` verify known patterns and blocked schemes.

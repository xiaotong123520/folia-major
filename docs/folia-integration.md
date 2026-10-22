# Folia integrated music link handling

This branch combines the AI radio, Apple Music web authorization, and share-link recognizer in the user's Folia fork.

## How a pasted link works

1. The AI Radio panel parses the HTTPS music share URL locally via `src/services/musicLinkResolver.ts`. The parser makes no network requests.
2. For a track with a usable ID on the existing NetEase, QQ, or Kugou provider, the panel requests metadata through `omni.getSongDetail(providerId, id)`.
3. When the provider returns a `UnifiedSong`, the panel adds it to candidate tracks. Playback is delegated to Folia's existing `onPlayOnline` handler and provider playback implementation.
4. Unsupported providers remain recognized for context, but the panel does not claim they play through Folia. Apple Music uses its separate official MusicKit authorization flow.

## Truthful availability

`canPlayInFolia` means the link is a known **track route with an identifiable ID** wired to a provider. It does not guarantee audio will be returned. A provider homepage, playlist/album link, raw Subsonic endpoint, and ordinary direct audio URL cannot currently be played from the paste-link form. For local server music, configure Navidrome/Subsonic in Folia rather than submitting raw API URLs.

Do not scrape premium URLs, bypass DRM, proxy arbitrary URLs, or send authentication cookies to untrusted services. YouTube and SoundCloud are external official-link options, not extracted audio streams.

## Verification

Run `npm run typecheck`, `npm run test:unit`, and `npm run build` on the integration branch and confirm the latest CI results before releasing. Runtime playback and Apple Music authorization require valid provider configuration and the user's own lawful entitlements.

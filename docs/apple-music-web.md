# Apple Music on Folia Web

Folia's Apple Music integration uses Apple's MusicKit JS authorization flow. It does not collect Apple ID passwords, reuse Apple Music app cookies, or provide a fabricated QR login.

## Required Vercel environment variables

Set the following for the Preview environment first, then redeploy the preview:

- `APPLE_MUSICKIT_TEAM_ID`: Apple Developer Team ID (issuer).
- `APPLE_MUSICKIT_KEY_ID`: MusicKit key ID.
- `APPLE_MUSICKIT_PRIVATE_KEY`: the complete contents of the MusicKit `.p8` private key.

All three variables are server-only and must **not** use the `VITE_` prefix. Never commit the private key, put it in client-side environment variables, or paste it into chat. The API route `/api/apple-music-token` signs a short-lived ES256 developer token and returns only that token to the browser. The private key remains in the server environment.

Create/configure the MusicKit key in the Apple Developer account and ensure the website origin/domain is permitted by Apple's MusicKit setup. Follow Apple's current portal instructions; requirements may vary with the account and current Apple Developer terms.

## User flow and limits

1. User selects **Apple Music** in Folia.
2. Folia loads Apple's MusicKit JS and requests official user authorization.
3. The UI can search the Apple Music catalog and asks MusicKit to play selected catalog items.
4. User can revoke authorization from the UI.

Catalog search does not require a paid subscription in the same way that personal-library access and playback may. Personal library APIs, playback, country availability, subscription, browser support, and Apple authorization policies can limit functionality. The current integration must not claim access to a user's private library unless it explicitly fetches and verifies that data.

There is no assumed Apple Music QR-login endpoint. Use Apple's official MusicKit authorization flow instead.

## Validation

After setting Preview variables and redeploying:

- `GET /api/apple-music-token` should return `200` with a developer token when configured.
- Without any required variable, it should return `503` with code `APPLE_MUSICKIT_NOT_CONFIGURED`.
- A successful token response does not prove that the Apple user has authorized Folia or has a playback-capable subscription; test the full flow on the deployed HTTPS origin.
- Never share full token responses, user tokens, or private key material in bug reports.

Official documentation:
- [User authentication for MusicKit](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit)
- [Generating developer tokens](https://developer.apple.com/documentation/AppleMusicAPI/generating-developer-tokens)

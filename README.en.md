# Tongsheng Music

A personal mobile and desktop web music player based on Folia.

- Current Vercel site: https://folia-major-ai-radio-preview.vercel.app/
- Static GitHub Pages preview: https://xiaotong123520.github.io/folia-major/ (updated only after a successful Pages workflow).

As of 2026-10-24, server-source audio has been observed loading and advancing during browser playback. The user has confirmed that both NetEase and QQ Music support QR sign-in and successful playback after authorization. Platform playback is user-confirmed; server-source playback was separately observed in the browser.

Mobile web layouts now reserve the status-bar, home-indicator and landscape safe areas and use dynamic viewport height. Floating tools and the local player have bounded, scrollable content. Type checking and the production build passed; installed iPhone app sizing still requires physical-device verification. See the Chinese README for home-screen installation and update steps. Local data and sign-in state may differ between browser, installed app and hosting origins.

See [README.md](README.md) for browser audio imports, optional server music, deployment and upstream update instructions. See [NOTICE.md](NOTICE.md) and [LICENSE](LICENSE) for preserved Folia attribution and AGPL-3.0 terms.

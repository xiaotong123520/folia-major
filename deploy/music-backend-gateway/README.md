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


## 桐声音乐：启用你提供的三个点歌接口

本分支把三个第三方点歌来源部署在**私有 Node.js 后端**，不在浏览器直连：

- QQ 主源：`api.lxink.cn/api-qqmusic/`（`action=play&type=vip&songName=...`）
- QQ 备用：`cer.luckying.love/music/Lucky.php?Love=...`
- 网易云：`cer.luckying.love/music/LuckyWYY.php?Love=...`

`docker-compose.yml` 使用三个容器：`go-music-api`、`music-source-fallback`、`music-backend-gateway`。服务端请求链路是浏览器 → 宝塔 HTTPS → 仅对本机开放的 8090 网关 → 私网 8093 聚合接口 → Go / 点歌接口。不会向公网开放 Go API 的 cookie 登录等管理路由，也不会把服务器 token 发送到前端。

**启用状态**：`.env.example` 中 `MUSIC_ENABLE_NAME_LOOKUP=true`；Docker Compose 同样默认 true。网页搜索结果会增加「QQ点歌接口（版本待验证）」和「网易云点歌接口（版本待验证）」两个可选来源；QQ 会先尝试 lxink，失败后尝试 Lucky.php，网易云尝试 LuckyWYY.php。只接受实际音频响应或经允许的 HTTPS 音频地址。若返回的是微信点歌卡片、HTML 或不可播放数据，不会错误地把它当成音频，也不会保证 VIP 歌曲可用。

服务器部署（需要你在宝塔终端／Termius 上操作，当前连接无法直接登录服务器）：

1. 把此目录及 `fallback/server.mjs` 上传/拉取到服务器，执行 `cp .env.example .env`，用 `openssl rand -hex 32` 创建专用 `MUSIC_BACKEND_API_KEY`，写入服务器的 `.env`（不要上传到 GitHub）。
2. 若使用示例 Go API 容器，执行 `printf '{}' > cookies.json && chmod 600 cookies.json`，只在服务器保留此文件。
3. 按实际返回音频的 HTTPS 主机，核对 `MUSIC_AUDIO_ALLOW_HOSTS`。默认列出的音频 CDN 是候选值，不代表点歌接口一定返回这些域名；遇到不同域名需先确认安全及授权再增加。禁止加 `*`、内网 IP 或未知任意域名。
4. `docker compose config --quiet && docker compose up -d --build`。检查 `docker compose ps` 和 `docker compose logs --tail=100 music-source-fallback`。
5. 本机执行 `curl http://127.0.0.1:8090/healthz`。通过宝塔把独立 HTTPS 音乐 API 域名反代到 `127.0.0.1:8090`。
6. 若是**面向公众且有权开放**的曲库，可以配置 `MUSIC_PUBLIC_ORIGINS=https://xiaotong123520.github.io`，在 GitHub Actions Variables 设 `VITE_MUSIC_BACKEND_BASE_URL=https://你的API域名` 并重新构建 Pages。**Origin/CORS 不能保护私人内容**。若需私有访问，请通过 Vercel 服务端代理和鉴权，而不是公开 Pages 模式。

验证步骤：在网页搜索一首可公开播放的歌曲 → 手动选择「QQ点歌」或「网易云点歌」 → 点击播放并拖动进度；同时在浏览器开发者工具查看 `/api/v1/music/stream` 是否返回 `audio/*` 和 200/206。当前外部三方 API 未能直接取得可核实音频响应，必须在实际运行服务器上进行测试。

本仓库附带不联网的模拟音频测试：`node --test deploy/music-backend-gateway/fallback/server.test.mjs`，以及 `.github/workflows/verify-song-api-server.yml`。这些测试证明代码调用顺序与接口兼容逻辑，不能证明第三方服务真的在线或有会员播放授权。


## Three enabled server-side point-song endpoints

The Docker service `music-source-fallback` sits between the existing authenticated gateway and the original Go API. These **three user-supplied name-based endpoints** are enabled with `MUSIC_ENABLE_NAME_LOOKUP=true`:

| Platform | Endpoint |
|---|---|
| QQ first | https://api.lxink.cn/api-qqmusic/?action=play&type=vip&songName= |
| QQ second | https://cer.luckying.love/music/Lucky.php?Love= |
| NetEase | https://cer.luckying.love/music/LuckyWYY.php?Love= |

The QQ search alternative tries the first URL, then the second on an error; NetEase uses its own URL. Search labels warn that name-based lookups can return a different recording. Actual audio must have an allowed content type. Remote media URLs and redirects must use HTTPS and match `MUSIC_AUDIO_ALLOW_HOSTS` (configured in your private `.env`); unexpected HTML/JSON is not streamed as audio. `type=vip` is an existing vendor query parameter and does not grant membership or DRM permissions.

The interfaces are **configured, not externally verified or deployed to your actual server**. The source response schema and availability can change.

### Deploy on your Baota server via SSH / Termius

Docker and Docker Compose must be installed. On the server terminal:

~~~sh
git clone --branch feature/multi-source-playback-gateway https://github.com/xiaotong123520/folia-major.git tongsheng-dev
cd tongsheng-dev/deploy/music-backend-gateway
cp .env.example .env
printf '{}\n' > cookies.json
chmod 600 .env cookies.json
~~~

Change the sample `MUSIC_BACKEND_API_KEY` in `.env` to a random, unique 32+ byte secret (e.g. generate with `openssl rand -hex 32`); do not share or commit it. Ensure `MUSIC_ENABLE_NAME_LOOKUP=true` and carefully configure `MUSIC_AUDIO_ALLOW_HOSTS` with **trusted media hostnames only**.

~~~sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -i http://127.0.0.1:8090/healthz
~~~

In Baota, create a **dedicated HTTPS API host** pointing via Nginx reverse proxy to `http://127.0.0.1:8090`. Ports 8080 and 8093 remain private; the only host-bound port is 8090 on loopback.

To use it with GitHub Pages, the repository Actions variable `VITE_MUSIC_BACKEND_BASE_URL` must point to the publicly resolvable HTTPS API origin, with no API secret. The backend `MUSIC_PUBLIC_ORIGINS` may include `https://xiaotong123520.github.io` **only if serving audio that anyone is permitted to access**: CORS and Origin are not authentication. For private data, use the existing Vercel server-side Bearer proxy or a separate user-authenticated solution.

The development branch is not production. It does not modify existing server music files. Finish automated tests, real HTTPS streaming with Range/206, and browser testing before merging/publishing.

### Verification

The CI workflow `.github/workflows/verify-song-api-server.yml` checks Node syntax, mocked endpoint fallback cases, Range handling, the original gateway, and Docker Compose. Unit tests prove request/response handling, **not that the three live upstreams are operational**.

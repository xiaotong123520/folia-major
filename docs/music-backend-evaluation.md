# Folia 音乐解析后端评估（第一轮）

更新时间：2026-10-22

## 目标

为 Folia 增加可维护的在线音乐来源和失效换源能力，同时保留现有本地音乐库、Navidrome/Subsonic 和现有 provider。此文档只记录评估与接入边界，不会部署第三方服务，也不会读取或保存用户 Cookie。

## 候选项目

### A. guohuiyuan/go-music-api + guohuiyuan/music-lib

- 项目：<https://github.com/guohuiyuan/go-music-api>
- 底层库：<https://github.com/guohuiyuan/music-lib>
- README 列出的平台包括网易云、QQ、酷狗、酷我、咪咕、千千、5sing、JOOX、Bilibili 等。
- 有搜索、歌词、封面、音频流代理、资源探测、换源、歌单/专辑和部分平台扫码登录。
- 运行要求 README 标注 Go 1.25+；提供 Docker Compose。
- 两个仓库的 LICENSE 文件标示 AGPL-3.0。若将其改造后通过网络向用户提供服务，需先由项目维护者确认 AGPL 对分发、修改和网络服务场景的义务；不能只复制代码而忽略许可。
- **当前阻断项：安全审查未通过，禁止直接公开部署。** 路由代码把 GET/POST Cookie 管理端点直接挂载到路由上；GetCookies 会返回 Cookie 配置，SetCookies 可写入并保存 Cookie。路由代码还设置了宽泛 CORS（Access-Control-Allow-Origin: * 与 Access-Control-Allow-Credentials: true）。当前所读路由文件未见认证中间件。上线前必须限制到内网/可信来源，给管理接口增加鉴权，移除不安全的 CORS 组合，并限制请求频率和资源访问。
- README 的平台列表是项目自述，不代表所有歌曲、会员音质、账号登录或地区资源都稳定可用；必须逐平台实测。

### B. Yuncan050115/ourcraft-music-api

- 项目：<https://github.com/Yuncan050115/ourcraft-music-api>
- Node.js 18+，MetingJS 兼容，支持网易云、酷狗、酷我搜索及免费歌曲。
- README 明确写明 v0.28.0 已移除用户登录/绑定；网易云 VIP URL 依赖服务端 NCM_COOKIE，酷狗 VIP 有 IP 绑定限制。
- 许可标示 AGPL-3.0。适合做轻量接口兼容性对照，不应假设能解决所有会员曲目。

### C. wangweeii/music（musicdl）

- 项目：<https://github.com/wangweeii/music>
- Python 下载/研究工具，平台覆盖较广，包含 QQ、网易云、酷狗、Apple Music、SoundCloud 等。
- README 明确标注 PolyForm Noncommercial 1.0.0、禁止商业使用，并声明不得用来绕过付费墙、DRM 或访问控制。
- **不建议作为 Folia 面向用户的生产播放后端**；只可在符合许可与平台条款的前提下用于评估元数据覆盖、接口稳定性和授权资源接入。

## Folia 当前接入策略

Folia 已有 provider registry 和统一的在线音乐接口，当前注册网易云、酷狗、QQ、Bodian、YouTube Music、Spotify。不要让前端直接依赖第三方解析服务的原始响应；应新增独立 adapter，将后端结果映射到 Folia 现有的 SongResult / ProviderAudioSource / lyrics 等类型。

建议分阶段：
1. 保留已有 provider；先补齐链接识别与“可播放/需要账号/仅官方页面”的明确状态。
2. 在隔离分支中实现后端 adapter 和配置项；不将任何 Cookie、API 密钥写入前端或仓库。
3. 对后端设置服务端访问密钥、CORS allowlist、速率限制、超时、响应体上限、重定向与目标地址校验。
4. 对歌曲播放地址执行 Range/206、过期 URL、CORS、iOS Safari、跨域与失败换源测试。
5. 只接入合法授权、公开可播放或用户本人有权访问的音源；不能把识别到的 VIP 链接当作会员授权，也不能绕过 DRM/付费限制。
6. 运行 typecheck、unit tests、build 和部署预览验证后，再由维护者决定是否合并。

## 数据与安全保护

- 不改动 Folia 现有本地音乐库、媒体缓存或 Navidrome 数据。
- 不把用户平台 Cookie 上传到第三方 API；如需用户登录，优先使用官方授权流程或在自托管服务器本地安全保存。
- 不提交 .env、Cookie、令牌、私钥或扫码登录结果。
- 此评估文档不代表已部署、已连接第三方服务或已通过播放验证。

## 下一步

优先审查 go-music-api 的依赖、容器端口暴露、Cookie 文件权限、管理接口和流代理的 SSRF/Range 行为；同时核对 Folia provider 接口后再写最小 adapter。候选项目未通过安全审查前不应绑定生产站点。

# 桐声音乐：服务器接入与验收

## 已实现与仍需配置

前端可从 `VITE_MUSIC_BACKEND_BASE_URL` 指定的自有 HTTPS 服务调用音乐接口。地址为空时关闭服务器能力，不假装已部署。此代码包不包含你的服务器地址、SSH 凭据或平台 Cookie，因此还不能宣称服务器已上线或真实在线音乐已验收。

现有 API 若不符合以下契约，需要编写服务端适配。不要直接把带密钥的第三方解析地址填进前端。

| 路由 | 参数 | 返回 |
| --- | --- | --- |
| GET `/api/v1/music/search` | q、limit、offset | `{code:200,data:{songs:[{id,source,name,artists,album,durationMs}],total}}` |
| GET `/api/v1/music/stream` | id、source、name、artist、album、cover | 音频；支持 Range、206、Content-Range、Accept-Ranges |
| GET `/api/v1/music/lyric` | id、source、name、artist | `{code:200,data:{lyric:"[00:00.00]..."}}` |

source 是平台 ID，如 netease、qq、kugou。详情兜底只接收搜索结果中平台和歌曲 ID 均相符的曲目；服务器按歌曲 ID 搜索无精确结果时提示无结果。可以在「导入音乐 / 链接解析」中按名称搜索，再手动选择。

## GitHub Pages + 宝塔 HTTPS 网关

`deploy/music-backend-gateway` 提供已测试的只读网关与可选 Docker Compose。若已部署符合上表的服务，可直接让网关的 `MUSIC_BACKEND_INTERNAL_URL` 指向该服务；不要重复部署或改动原有本地音乐库。

1. 将网关运行在服务器环回地址，宝塔以独立 HTTPS 域名反代到 `127.0.0.1:8090`。
2. 网关密钥 `MUSIC_BACKEND_API_KEY` 只存服务器环境。平台 Cookie 只留在私有上游，不上传到 GitHub。
3. Pages 直接连接网关时，设 `MUSIC_PUBLIC_ORIGINS=https://xiaotong123520.github.io`。这是公开只读模式：浏览器不需要、也不会获得 Bearer 密钥。CORS 是浏览器边界，不能当成用户鉴权；该模式允许公众读取白名单音乐接口。仅在确实要提供公开播放的服务器启用，并在宝塔限制请求频率。私有曲库请使用带用户鉴权的 Navidrome 或 Vercel 服务端代理。
4. GitHub 仓库 Settings → Secrets and variables → Actions → **Variables** 新增 `VITE_MUSIC_BACKEND_BASE_URL=https://你的API域名`。这是公开地址，不得包含账号、密码、token。重新运行 Pages 发布。
5. 网关转发 Range 与音频响应头，API Cookie/扫码管理和任意 URL 代理均不在路由白名单中。

默认 Compose 上游是可选的 go-music-api。上线前需核对其接口及服务条款；已有解析接口优先复用。解析服务不会授予平台订阅或 DRM 权限，受限资源仍以平台授权结果为准。

## Vercel + 私有网关

前端 `VITE_MUSIC_BACKEND_BASE_URL=/api/music-backend`；Vercel 服务端配置：

- `MUSIC_BACKEND_UPSTREAM_URL`：网关 HTTPS 地址。
- `MUSIC_BACKEND_UPSTREAM_API_KEY`：网关密钥。
- `FOLIA_ALLOWED_ORIGINS`：网站完整 origin，逗号分隔。

重建后，`vercel.json` 将前端固定路由交给 `api-ts/music-backend-proxy.ts`。密钥不使用 VITE_ 前缀。此模式无需开启网关的公开 Pages 模式。

## 验收清单

- 公开或已授权的曲目：搜索→选择→播放→暂停→拖动进度→下一首。
- iPhone Safari 和电脑浏览器分别验证；不能把桌面通过当成手机实测。
- 对音频请求 `Range: bytes=0-1023`，应收到 206、正确长度及 Content-Range；上游错误不得伪装为音频。
- 分享链接接口失败时按同平台、同 ID 回退；无匹配就显示错误，不能自动换成其他录音。
- 本地导入后刷新，文件仍能播放；清空队列后刷新不会复活；隐私模式/空间不足显示保存失败提示。
- main 的 Pages 构建和发布均成功后，在网站确认标题、图标和新入口。

## 上游同步

每日定时任务只生成审查分支/PR，保留个人代码和 AGPL 版权声明。有合并冲突时需处理冲突；不会使用强制覆盖 main 的方式“同步”。生产前应核对 PR 的类型检查、单测和浏览器播放结果。

## 已核实的额外方案与待测点歌接口（2026-10-23）

当前推荐使用仓库已整合的 go-music-api：它有明确的 `/api/v1/music/search`、`/api/v1/music/stream`、`/api/v1/music/lyric` 契约，并支持网易云、QQ、酷狗、酷我等平台。仓库中还加入了 [PHP 8.0–8.4 自有曲库接口](../deploy/php-music-api/README.md)，可以作为**自有服务器音乐来源**；不能把标题相近的其他录音自动冒充原曲目。

研究候选：
- https://github.com/guohuiyuan/go-music-api （当前主线路线，已有适配代码；部署前仍需实播测试）
- https://github.com/ELDment/Meting-Agent （搜索/单曲/歌词能力，需另写服务器适配）
- https://github.com/Yuncan050115/ourcraft-music-api （网易云、酷狗、酷我；其维护文档注明 2026 年 QQ provider 已移除）

以下由用户提供的点歌接口**尚未验证 DNS、响应格式和可持续可播放性**，不直接添加到公开浏览器或强制当作可用音频源：
- `https://api.lxink.cn/api-qqmusic/?action=play&type=vip&songName=`
- `https://cer.luckying.love/music/LuckyWYY.php?Love=`
- `https://cer.luckying.love/music/Lucky.php?Love=`

服务器侧的检查工具：`node deploy/music-backend-gateway/probe-point-song-endpoints.mjs "测试歌名"`。它只读取有上限的响应信息及 JSON 键，不跟随跳转、不下载媒体。待确认返回格式、访问授权以及能否支持 Range/206 后才能考虑编写可靠适配；普通 200 或返回 URL 都不等于可播放。平台会员及 DRM 访问限制仍应由原平台合法授权决定。

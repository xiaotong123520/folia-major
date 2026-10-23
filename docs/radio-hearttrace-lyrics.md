# 电台、封面墙与服务器歌词

此版本属于开发 PR #17；**还未合并到 main/GitHub Pages 正式版**。不要把模拟测试当作真实歌词获取成功。

## 电台如何与原版共用主播放器

- 从手机「电台」输入情绪、歌名或关键字，系统优先调用 Omni 的 `hearttrace` provider 查询现有服务器公开曲库（同一录音、同一封面 URL、同一歌词查找键）。
- 查询没有足够匹配时会从这个曲库补充曲目，再加入其他已配置且可搜索的来源。
- 选择电台歌曲或「播放整组电台」时，使用原版 `playSong(song, stationQueue, false)`，关闭电台弹窗后进入既有队列封面墙 `Lattice`，不创建另一个音频元素。
- 原版封面墙取自 `song.album.coverUrl` 或 `getSongCoverUrl(song)`；服务器曲库目录与曲目 ID 保持原样，拒绝仅凭同名歌曲替代。

## 以前为什么拿不到歌词

旧版服务器歌词 provider 只通过写死的 `folia-major-ai-radio-preview.vercel.app/api/lyric-proxy` 请求，失败就没有备用路径。该预览 Vercel 服务是否可用、是否启用了部署保护、有没有被构建限额限制，以及原服务器能否跨域读歌词，都必须线上验证。

现在服务器曲目严格使用**专辑目录 + 目录内原始曲目序号**调用 `https://我爱南京.com/api/lyrics.php?a=<目录>&n=<曲目序号>`：

1. 优先从 GitHub Pages 浏览器读取源站歌词（需要源站 HTTP 响应允许 `Origin: https://xiaotong123520.github.io`）。
2. 源站跨域失败、HTTP 错误或没有有效歌词时，通过可配置 HTTPS CORS 歌词代理再次尝试。
3. 将纯文本 `[00:01.00]...`、JSON `{"data":{"lyric":"[00:01.00]..."}}` 等常见格式归一化为时间轴 LRC。
4. 服务端确实没有歌词（204/404）时返回无歌词，不将歌曲标成纯音乐，更不根据同名曲目乱配歌词。代理返回 HTML/错误 JSON 时不会显示为歌词。

### 可选代理变量

在 GitHub 仓库 Settings → Secrets and variables → Actions → Variables 添加 `VITE_HEARTTRACE_LYRICS_PROXY_URL`，值为你已部署且允许 GitHub Pages 跨域访问的 HTTPS `/api/lyric-proxy` 完整地址（**不可带 token**）。注意静态 GitHub Pages 不能执行 PHP/Node/Vercel serverless，不设置且原源站拒绝 CORS 时，网页依然无法加载歌词。

如果你使用独立 Vercel serverless 代理，必须确保它已部署、返回 `Access-Control-Allow-Origin`，并可合法访问服务器对应歌词端点。现有 `api-ts/lyric-proxy.ts` 具有只读的业主域名路径白名单，不能将该接口改造成不受限制的任意 URL 转发器。

## 真实歌词的最小验收

从浏览器开发者工具 Network 查看一首**已知确实有 LRC 的服务器录音**：

- 请求 `/api/lyrics.php?a=8&n=2` （这是目录/编号的一个示例，不保证该编号当前必有歌词）是否返回 200/204/404。
- 200 的响应是否包含真正的 `[mm:ss.xx]` 时间标签（或 JSON 歌词字段）。
- 直接请求是否出现 CORS 错误，代理 URL 是否被保护为 HTML 登录页、401、403 或 502。
- 当网络返回 200，但内容只是 JSON 错误或 HTML 页面时，应视为失败。
- 进入封面墙时，电台的歌曲队列是否与弹窗中的推荐一致，封面是否沿用当前服务器专辑图。

只有浏览器里歌词逐字或逐行随音频时间正确滚动，才算真正完成歌词验收；当前尚未验证服务器实播。

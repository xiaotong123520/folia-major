# 桐声音乐

手机和电脑使用同一套 React + TypeScript + Vite + Zustand 网页代码。主分支发布到：

**https://xiaotong123520.github.io/folia-major/**

右上角「桐声音乐」菜单包含音乐文件导入、分享链接解析、电台与 Apple Music 官方授权。可将网页添加到手机主屏幕作为 PWA 使用。

## 当前能力

- 本地音频：通过普通文件选择器导入，兼容没有文件夹访问 API 的手机浏览器；使用原生音频控件播放。
- 刷新恢复：音频字节和网络直链保存在当前浏览器的 IndexedDB，重新打开后恢复队列，不会恢复已经失效的 blob URL。浏览器空间不足时显示提示。不会上传文件。
- 手机与电脑布局：同一版本发布；入口、弹窗和导入播放器适配窄屏、触控与安全区域。
- 分享链接：识别平台与歌曲 ID，经 Omni 读取曲目；可选后端按原平台 + 精确 ID 兜底，不按标题自动替换其他录音。
- 服务器音乐：可选只读网关和 Omni 适配器，支持搜索、歌词与 Range 音频流；需配置你自己的真实服务。

本地文件仅保存在导入它的浏览器，**不会自动出现在另一台设备**。两端共享曲库请配置 Navidrome 或服务器音乐源。清除浏览器数据会移除本地导入缓存，需保留原文件。网络直链也可能过期。

## 发布与上游更新

- `.github/workflows/deploy-github-pages.yml`：main 更新后执行类型检查、音乐功能单测、网关测试、生产构建与 Pages 发布。
- GitHub Pages 使用 Actions 作为来源，`folia-pages-preview` 环境只允许 main 部署。
- `.github/workflows/sync-upstream.yml`：每天北京时间 10:00 检查 Folia 上游，合并到专用 review 分支并创建更新 PR。不会直接覆盖个人主分支；冲突会停止并在 Actions 摘要列出文件。合并经过检查的 PR 后自动发布双端网站。
- 需在 Settings → Actions → General 允许 GitHub Actions 创建 pull request。机器人 PR 不会自动触发 GitHub 的 pull_request CI，请在合并前运行检查；也可手动触发该更新工作流。

## 自有服务器解析兜底

见 [服务器接入与验收](docs/personal-deployment.md)；如需播放你服务器上已经保存的合法音乐文件，另见 [宝塔 PHP 本地曲库接口](deploy/php-music-api/README.md)。该接口不会移动或修改原歌曲。GitHub Pages 只托管前端，无法运行 PHP/Node、保存平台会话或提供服务器音频代理。尚未配置 API 地址时，界面明确显示服务器未连接。

## 开发

```bash
npm ci
npm run typecheck
npm run test:unit
GITHUB_PAGES=true npm run build
```

服务端入口位于 `api-ts/`，由构建生成 `api/`。本地浏览器导入代码位于 `src/components/app/ImportedAudioPlayer.tsx` 与 `src/services/importedAudioStorage.ts`。

## 开源与来源

本项目基于 Folia，遵循 AGPL-3.0。原始版权、贡献者和第三方声明保留，详见 [NOTICE.md](NOTICE.md)、[LICENSE](LICENSE) 与 [CONTRIBUTORS.md](CONTRIBUTORS.md)。


## GitHub Pages 直连点歌（不使用服务器）

在网页右上角「桐声音乐 → 导入音乐 / 链接解析」中输入歌名，选择 QQ 点歌、网易云点歌或 QQ 备用接口；音源会添加到网页下方的音频队列。QQ 首选加载失败时尝试第二条 QQ 地址。候选地址和备用地址存储在当前浏览器 IndexedDB 中，刷新后可恢复。

使用的原始接口：

- `https://api.lxink.cn/api-qqmusic/?action=play&type=vip&songName=`
- `https://cer.luckying.love/music/LuckyWYY.php?Love=`
- `https://cer.luckying.love/music/Lucky.php?Love=`

**重要边界**：纯静态 GitHub Pages 不能执行 PHP、Node 服务端代理，也无法绕过 CORS、需要私钥的音频地址、VIP/DRM 访问限制。如果第三方接口直接返回音频、重定向到音频，或返回**允许浏览器跨域读取（CORS）的 JSON 音频地址**，播放器会尝试播放；若 JSON 不允许跨域读取、接口返回 HTML、需要 Cookies/签名或缺少授权，不能保证播放。此功能是可测试的直连点歌入口，不代表这三个第三方接口已通过真实音频验收，也不等于会员解锁。请勿把含凭据的私密 URL 粘贴到公共分享场景。


## 宝塔视频库（可选）

桐声音乐现在可以使用 **GitHub Pages 托管的手机 / 电脑前端 + 宝塔 PHP 视频上传服务**。网页菜单中「视频库」负责视频浏览和原生 HTML5 播放；「管理员上传视频」打开服务器独立的 HTTPS 后台，在 iPhone、安卓或电脑选取 MP4 / WebM / MOV 上传。推荐 H.264/AAC 的 MP4 以获得最好的兼容性。

服务器原始视频存储在宝塔**网站根目录外**，不会提交到 GitHub，也不会移动原音乐文件。播放 API 支持 Range/206 拖动进度。默认是**禁用公众访问**：只对有公开传播授权的视频，在管理员确认后开启 `public_gallery=true`。这是公开视频库，不是仅自己可见的私有鉴权影院。

部署步骤与安全细节见 [宝塔 PHP 视频服务文档](deploy/php-video-api/README.md)。GitHub Actions Variables 变量 `VITE_TONGSHENG_VIDEO_API_URL` 应填成服务器的 HTTPS `index.php` 地址，不能包含密码或私钥。只更新前端并不会把 PHP 服务部署到你的实际服务器。

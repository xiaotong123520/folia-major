# 桐声音乐：PHP 8.0–8.4 宝塔本地曲库服务

本服务把**服务器已经拥有且有权播放的音乐文件**变成搜索与可拖动的 HTTPS 音频流。**不移动、不修改、不上传原歌曲**，也不会解锁网易云/QQ/酷狗会员资源。服务器本地曲库与已有的多平台 Go 后端使用相同 `/api/v1/music/*` 接口，可择一配置为网页的音乐源。

## 目录及部署

- `index.php`：只读 HTTP API，不读取用户提交的文件路径或远端 URL。
- `build-index.php`：命令行扫描目录，私有 JSON 索引写到另一个目录。
- 支持 PHP 8.0–8.4；线上必须通过宝塔或 Nginx 暴露 HTTPS，不直接开放本机端口。

请将占位路径换成真实路径，原有音乐文件不用移动：

~~~bash
mkdir -p /www/server/ts-private
php build-index.php /www/wwwroot/你的音乐目录 /www/server/ts-private/music-index.json

export MUSIC_LIBRARY_ROOT=/www/wwwroot/你的音乐目录
export MUSIC_LIBRARY_INDEX=/www/server/ts-private/music-index.json
export MUSIC_BACKEND_API_KEY='用 openssl rand -hex 32 生成的随机密钥'
php -S 127.0.0.1:8092 index.php
~~~

宝塔建立独立 HTTPS 子域名，反代 `http://127.0.0.1:8092`。线上也可把网站根指向本目录，让 PHP-FPM 配置所有 `/api/v1/music/*` 路径交给 `index.php`，并传入环境变量；JSON 索引必须放在网站根目录外。

## 连接方式

**私有 Vercel 代理（推荐）**：服务器配置 `MUSIC_BACKEND_API_KEY`；不要设置 `MUSIC_PUBLIC_ORIGINS`。在 Vercel Preview 的服务端配置：

~~~dotenv
MUSIC_BACKEND_UPSTREAM_URL=https://你的音乐API域名
MUSIC_BACKEND_UPSTREAM_API_KEY=<与服务器相同的密钥>
FOLIA_ALLOWED_ORIGINS=https://你的Vercel预览域名
VITE_MUSIC_BACKEND_BASE_URL=/api/music-backend
~~~

只有带服务端密钥的 Vercel 代理能调用 PHP 服务器。不要将密钥放进 `VITE_` 前缀变量，也不要上传 GitHub。

**GitHub Pages 公开模式**：**仅当曲库允许任何人听**，才配置服务器：

~~~dotenv
MUSIC_PUBLIC_ORIGINS=https://xiaotong123520.github.io
~~~

然后在 GitHub 仓库 Settings → Secrets and variables → Actions → Variables 中添加 `VITE_MUSIC_BACKEND_BASE_URL=https://你的音乐API域名` 并重新构建 Pages。CORS、Origin 并非身份鉴权，可以被非浏览器客户端伪造；私有文件不能以此保护。

## 接口与验收

- `GET /healthz`：返回 ok。
- `GET /api/v1/music/search?q=歌名&limit=20&offset=0`：返回 `{code:200,data:{songs:[{id,source:"local",name,artist,album,durationMs:0}],total}}`。文件名 `歌手 - 歌曲.mp3` 会被拆为艺术家与歌名。
- `GET /api/v1/music/stream?source=local&id=<索引ID>`：返回媒体数据；`Range: bytes=0-1023` 返回 206、Content-Range、Accept-Ranges。
- `GET /api/v1/music/lyric`：目前只返回空歌词，在线歌词由其他平台接口负责。

导入/删除服务器歌曲后重新执行 `build-index.php`，不应手工编辑 JSON。注意这只是基于文件名的索引，不负责提取 ID3/内嵌封面、转码、会员鉴权或跨浏览器同步。某些 FLAC/Opus 浏览器可能无法解码。线上真实媒体与 iPhone Safari 仍需验收。

自动化测试位于 `.github/workflows/verify-server-php.yml`，检查 PHP 8.0/8.4 语法、搜索、HTTP 206/416、CORS 等。

# 从宝塔服务器读取已有音乐（不重新上传）

这一模块针对服务器上**原本就存在**的音频文件（MP3、M4A、AAC、WAV 等）。服务器作为网页的播放来源，不下载或移动文件、不修改文件名、不覆盖任何音乐。手机和电脑通过 HTTPS 读取同一个索引；只扫描配置的目录。

## 已落地的代码

- `deploy/php-music-api/build-index.php`：只读扫描服务器音乐目录，输出一份独立的私有 JSON 索引；实际音频不会被改动。
- `deploy/php-music-api/index.php`：`/api/v1/music/search` 返回歌曲以及**限时签名播放 URL**，`/api/v1/music/stream` 处理 `Range`，音频响应 200/206/416。
- `src/components/app/ServerAudioLibrary.tsx`：手机端连接服务器、输入只读口令、搜索列表、点击播放、前后切歌。
- `src/components/app/MobileMediaHome.tsx`：手机首页和音乐页进入“服务器原有音乐”；旧 Folia 网格只在经典模式展示，桌面端保留旧布局。

手机里粘贴的地址只是你的**媒体 API HTTPS 根域名**，不是宝塔面板登录地址，也不能填服务器文件夹路径。只读访问口令只保存在当前页面内存；不写 localStorage，刷新后需要重新输入。**不要将宝塔管理员密码输入播放器**。

## 宝塔部署（需要你协助登录服务器）

1. 在宝塔文件管理中找到音乐目录的**真实绝对路径**，例如 `/www/wwwroot/music` 或 `/data/audio`。不要把音乐文件复制到 GitHub/Vercel，不要给扫描程序写入音乐目录的权限。
2. 在宝塔添加一个独立 PHP 8.0–8.4 站点，例如 `music-api.example.com`，启用 HTTPS。站点代码部署到 `deploy/php-music-api/` 目录，网站根目录不应包含音乐索引或服务器密钥。
3. 在 SSH 里执行（路径替换为实际位置；可以带空格但需要引号）：

```bash
mkdir -p /www/server/ts-private
php /www/wwwroot/你的API站点/build-index.php "/服务器原有音乐目录" "/www/server/ts-private/music-index.json"
openssl rand -hex 32 # 生成单独的只读访问口令
openssl rand -hex 32 # 生成单独的流媒体签名密钥（不要相同）
```

4. 把以下服务端变量配置在 PHP-FPM 的安全环境中，不要放在公网目录里的 `.env` 文件，不要写进前端变量。修改后重启对应 PHP-FPM。宝塔使用的 PHP-FPM 通常需要在对应 pool 的 `env[...]` 参数中明确传值（不要在修改管理面板模板前省略备份）：

```ini
MUSIC_LIBRARY_ROOT=/服务器原有音乐目录
MUSIC_LIBRARY_INDEX=/www/server/ts-private/music-index.json
MUSIC_BROWSER_ORIGINS=https://xiaotong123520.github.io,https://你的vercel域名
MUSIC_BROWSER_READ_TOKEN=第一串openssl生成的独立随机值
MUSIC_STREAM_SIGNING_KEY=第二串openssl生成的独立随机值
MUSIC_PUBLIC_ORIGINS=
```

生产模式还可以设置独立的 `MUSIC_BACKEND_API_KEY` 供现有服务端代理使用。不要将其和只读口令混淆。

5. 通过 Nginx 将 `/healthz` 和 `/api/v1/music/*` 转发到 `index.php`，保留 Authorization、Range 请求头并关闭媒体代理缓冲，避免拖动音乐进度时出现读取失败。若网站根目录就是这个 PHP 程序，常规 `try_files $uri $uri/ /index.php?$query_string` 路由也可以。完成 HTTPS 后在手机打开网页 → 首页 → 服务器原有音乐 → 填入 HTTPS API 域名和**只读口令** → 连接。

6. 服务器新增/删除歌曲后只要重新执行扫描命令即可。可以给扫描程序设置每晚定时任务；原歌曲不移动。

## 接口检查（无须暴露密码）

浏览器先检查 `https://你的API域名/healthz` 是否显示 `ok`。私有索引请求示例：

```bash
curl -H "Authorization: Bearer 你的只读口令" \
  "https://你的API域名/api/v1/music/search?q=&limit=2"
```

预期 `data.songs` 含 `id`、`name`、`artist`、`streamUrl`；streamUrl 有 `expires` 和 `sig`。播放 URL 两小时有效，适合正常听歌和拖动进度，过期后刷新曲库获取新的 URL；不要分享私有签名链接。

对拿到的签名 streamUrl 使用 `curl -I -H 'Range: bytes=0-1023' 'https://你的API域名<streamUrl>'`，正确响应应为 `206 Partial Content`，并含 `Content-Range`。这样浏览器才能边听边缓冲、跳转进度。

## 重要安全边界

- **私有曲库不要配置 `MUSIC_PUBLIC_ORIGINS`**。它是公开内容模式，Origin/CORS 不等于鉴权，任何人可能伪造 Origin。
- `MUSIC_BROWSER_ORIGINS` 只用于设置跨域白名单，**访问仍必须有口令或有效签名 URL**。
- 只读口令和签名密钥是不同的随机值（至少 32 个字符），任何密码不放进 GitHub。
- 只读令牌允许得到曲库列表和可临时访问的签名播放 URL，因此只发给可信用户；已知 URL 在过期前可被他人播放，不能视作 DRM。
- 只支持浏览器能解码的实际音频格式；部分 iPhone 不支持 OGG/Opus/FLAC。建议保留原文件，必要时额外生成兼容格式，不覆盖原件。
- 本分支准备了手机端和安全接口，但**还没有你的宝塔登录信息和真实音乐目录**；在服务器真正部署并实播验收之前，网页的连接功能可能显示“未连接”。Vercel/Pages 也不会自动拥有服务器文件权限。

如果还要处理服务器视频上传，需在独立视频 API 上另设管理员上传鉴权、文件大小上限、可写目录、配额及转码方案；不能复用只读音乐接口或将上传管理权限交给浏览器中的只读口令。

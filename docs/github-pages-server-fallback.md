# Folia 双端预览 + 宝塔服务器音乐解析兜底

## 已实现的架构

- **网站入口：** GitHub Pages `https://xiaotong123520.github.io/folia-major/`。React / Vite 同一套自适应界面，可用手机 Safari、Chrome 和电脑浏览器打开。
- **浏览器本地音乐：** 「链接解析 → 从手机或电脑选择音乐文件」，通过当前浏览器的 `Blob` URL 播放 MP3/M4A 等受支持格式，不上传你的私人文件。关闭/刷新标签页之后需要重新选择本地文件。
- **HTTPS 音频直链：** 「链接解析 → 粘贴地址 → 识别 → 加入播放列表」，本地浏览器可直接使用 `<audio>` 播放；不绕过服务器权限，链接必须实际返回媒体、支持浏览器解码及跨域播放条件。
- **已有平台适配器：** 网易云、QQ 音乐、酷狗使用 Folia 原生 Omni/provider 层。没有在 GitHub Pages 中配置原来的 `VITE_*_API_BASE` 时，用户可设置自己的 Folia 网关地址作为这三个平台的后端请求地址。
- **服务端 AI：** `/api/radio-agent`、`/api/apple-music-token` 和 `/api/lyric-proxy` 会使用相同的网关地址（没有配置时仍走原本网站自身 API）。
- **安全边界：** 仅识别合法链接和使用已有授权播放接口；不从付费应用提取 DRM 解密密钥，不绕过会员权限；仅允许配置一个 HTTPS 网关源，不在页面存储服务器 SSH 密码或 AI API Key。

## 宝塔服务器快速安装（只创建独立预览，不影响现有站点）

准备一台可用 Docker Engine / Docker Compose v2 / Git / OpenSSL 的 Linux 服务器。请在 **宝塔终端** 中执行：

```bash
git clone --single-branch --branch feature/ai-radio-agent-v1 \
  https://github.com/xiaotong123520/folia-major.git ~/folia-server-fallback
bash ~/folia-server-fallback/deploy/server/install-folia-fallback.sh
```

安装器将服务器 API 网关固定在 `127.0.0.1:18080`，并将 Sync 服务限制在 `127.0.0.1:13000`。首次运行会自动生成独立同步令牌，保存到部署目录的 `deploy/docker/.env` 文件。安装过程需要下载、构建多个 Docker 镜像；确保服务器内存、硬盘和网络满足要求。请不要把 `.env`、音乐会员 cookie、Apple Music 私钥贴到 GitHub。

若你的服务器已有该目录，则检查是否有未提交的本地修改；安装器不会自动覆盖本地代码。使用 `docker compose -f compose.yaml -f compose.build.yaml ps` 查看容器状态。

在宝塔面板中**新建专用 HTTPS 子域名**，例如 `music-api.example.com`，给它签发有效 TLS 证书，反向代理到：

```
http://127.0.0.1:18080
```

不要直接暴露 18080/13000 到公网；不要把此配置应用到原有的日记、博客或音乐库目录。

为了让 GitHub Pages 安全调用服务器，部署默认仅允许以下网页来源（Origin 不含路径）：

```
FOLIA_CORS_ALLOWED_ORIGIN=https://xiaotong123520.github.io
```

这一值定义在私有服务器 `.env` 里，如果网站换成独立域名，须改为新网页的**精确 HTTPS Origin**并重启 Gateway。不要设置成 `*`，不要为便于调试关闭鉴权或把 Navidrome 的 `NAVIDROME_PRESET_ALLOW` 改成 `any`。

## 验证服务器能否连接

在服务器运行：

```bash
curl -i http://127.0.0.1:18080/api/healthz
```

应该得到 JSON：

```json
{"ok":true,"service":"folia-web-api"}
```

在手机或电脑网络下打开下方网址（替换成真实域名）：

```text
https://music-api.example.com/api/healthz
```

对于跨域预检也可以在服务器上测试：

```bash
curl -i -X OPTIONS "https://music-api.example.com/qq/login/status" \
  -H "Origin: https://xiaotong123520.github.io" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: X-QQ-Session"
```

请确认响应包含 `Access-Control-Allow-Origin: https://xiaotong123520.github.io`。如果显示 HTML 登录页面或跳转到管理后台，说明反代目标配置错误。

## 手机、电脑操作

1. 打开 `https://xiaotong123520.github.io/folia-major/`。
2. 进入「链接解析」，点击「我的服务器音乐解析」。
3. 粘贴你刚设置的 `https://music-api.example.com`，点击「检测连接并保存」。网页会在检测通过后自动刷新。
4. 重新打开「链接解析」并尝试已有的网易云 / QQ 音乐 / 酷狗普通歌曲链接；这会走现有 provider，是否可播放以歌曲授权、账号和音频可用性为准。
5. 用「选择音乐文件」测试纯浏览器播放，或添加属于你自己的 HTTPS 音频直链。

手机和电脑的浏览器本地存储彼此独立，因此需要分别配置一次服务器地址。如果浏览器没有可用的本地存储，或在隐私模式中访问，设置可能不会保存。iOS Safari 的媒体播放通常需要手动点击一次播放按钮。

## 限制

- GitHub Pages 是**静态托管**；不存在运行 PHP / Node.js / Docker 的能力，不能用它单独替代音乐解析后端。
- Apple Music 的完整授权需要 Apple 开发者凭据和 MusicKit 支持；Apple Music 订阅本身不能替代开发者令牌签发。
- 网易云、QQ 音乐、酷狗、酷我等第三方平台可能受账号、版权、地区、接口稳定性及平台条款限制。酷我在现有 Folia 项目中**尚无实现完整播放的 adapter**。
- 音乐源地址可能过期、禁止引用或者跨域，不能保证所有分享链接直接播放；已有的播放失败诊断需要结合浏览器 Network 与服务器容器日志判断。
- 本次只提交 GitHub 代码和部署脚本；在没有服务器 SSH 授权和域名配置的情况下，不声称服务器已经上线。


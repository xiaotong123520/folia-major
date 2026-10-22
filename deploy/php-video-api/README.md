# 桐声视频库 — GitHub Pages 前端 + 宝塔 PHP 8.0–8.4

GitHub Pages 保留 Folia 手机/电脑界面。宝塔负责**管理员上传**和**HTTP Range 分段播放**。视频文件存到服务器私有文件夹，**不上传 GitHub 仓库，不会改动原有音乐目录**。

> **注意隐私**：这是“公开的视频库 + 私有管理员上传后台”的第一版，**不是私有家庭影库**。`public_gallery=true` 后，知道资源 URL 的任何人都能观看视频；CORS 和不显示链接**不能**代替观看鉴权。若不愿公开视频，请保持 `false`，不要把私人影片上传到打算公开播放的系统里。

## 第 1 步：在宝塔中建立 PHP 网站

1. 给媒体服务建立**独立的 HTTPS 域名**，例如 `video.example.com`。启用宝塔 PHP 8.0–8.4 + SSL。
2. 网站根目录例如 `/www/wwwroot/tongsheng-video-api`，**只**把本目录的 `index.php` 复制进该根目录。推荐访问路径：`https://video.example.com/index.php`。
3. 私有数据放到网站根目录**以外**。如使用 SSH/Termius：

~~~bash
mkdir -p /www/server/tongsheng-video/files
# 当前目录为下载的本仓库 deploy/php-video-api：
cp config.example.php /www/server/tongsheng-video/config.php
php -r 'echo password_hash("请换成你自己的长密码", PASSWORD_DEFAULT), PHP_EOL;'
~~~

把上一条命令输出的哈希填入私有 `config.php` 的 `admin_password_hash`。编辑 `storage_dir` 为私有视频文件夹，`allowed_origin` 设为 `https://xiaotong123520.github.io`。**不要把管理员明文密码、哈希配置、视频文件夹传到 GitHub。**

宝塔运行 PHP 的用户（常见为 `www`）必须对 `/www/server/tongsheng-video/files` 有读写权限；私有目录不要软链接到公开网站根。服务器上的原有音乐文件不用动。

## 第 2 步：上传大小与安全限制

在宝塔 PHP 配置中按实际最大视频大小设置（示例为 512 MiB）：

~~~ini
upload_max_filesize = 512M
post_max_size = 520M
max_file_uploads = 10
max_input_time = 600
max_execution_time = 600
~~~

在该站点 Nginx 配置的 `server` 块中加入：

~~~nginx
client_max_body_size 520m;
client_body_timeout 600s;
fastcgi_read_timeout 600s;
# 后台登录建议再开启 Nginx IP 白名单或 limit_req 防爆破
~~~

保存并重载 Nginx，重启当前 PHP 版本的 PHP-FPM。别把这组参数盲目加到所有网站。`config.php` 的 `max_upload_bytes` 是 PHP 代码自己的二次上限。

后台（HTTPS）：`https://video.example.com/index.php?action=admin`。先输入管理员密码，再从 iPhone/安卓/电脑选择视频，完成后返回 Folia 前端刷新视频库。

当前只检查文件真实 MIME（不是只信后缀），并保存为随机文件 ID：`.mp4`、`.webm`、`.mov`。**它不会自动转码**；建议上传 H.264 + AAC 的 MP4。体积较大或 HEVC/AV1/FLAC 视频可能在一些浏览器无法播放。需要更多格式时，可以在服务器上另用 FFmpeg 合法转码，而不是修改扩展名。

## 第 3 步：连接 GitHub Pages

1. 为**确实允许公开传播的视频**，显式修改私有 `config.php`：`'public_gallery' => true`。
2. 在仓库 [Settings → Secrets and variables → Actions → Variables](https://github.com/xiaotong123520/folia-major/settings/variables/actions) 新增：
   - 名称：`VITE_TONGSHENG_VIDEO_API_URL`
   - 值：`https://video.example.com/index.php`（用你的实际 HTTPS 域名替换）
3. GitHub Actions 中执行 `Deploy Tongsheng Music to GitHub Pages` 的 Run workflow，或将前端更新合并到 main 后自动构建。
4. 打开 `https://xiaotong123520.github.io/folia-major/`，手机右上角「桐声音乐 → 视频库」，电脑也可以在工具菜单打开视频库。管理员上传入口会跳转到你的宝塔 HTTPS 页面，网页不会接触管理员密码。

`public_gallery=false` 时列表和视频流都返回 403；需要真正**仅本人可看**，必须另行实现经过身份认证的播放流/临时签名 URL，不能启用公共库来代替身份认证。

## API 契约

| 请求 | 权限 | 返回 |
|---|---|---|
| `GET /index.php?action=list` | 公开模式 | `{"code":0,"data":{"videos":[{"id","title","mime","size","createdAt"}]}}` |
| `GET /index.php?action=stream&id=<32位hex>` | 公开模式 | 视频内容 `200`，或 Range `206` / `416` |
| `GET /index.php?action=admin` | 管理员浏览器 | HTML 登录/上传界面 |
| `POST /index.php?action=login` | 密码 + CSRF | 登录会话 Cookie |
| `POST /index.php?action=upload` | 登录 Cookie + CSRF | 表单上传并索引文件 |
| `POST /index.php?action=logout` | CSRF | 退出登录 |

列表和播放只有对配置的 GitHub Pages Origin 才设置 CORS 头；视频播放器不使用跨站凭据。切记视频播放 URL 本身是公开可访问的，访问 Origin 头不能防盗链或替代身份校验。浏览器上传需要 PHP Session Cookie、CSRF，避免把管理员凭据写进静态网站 JS。支持视频 byte-range、`Content-Range` 和 `Accept-Ranges`，可拖动进度。

## 本地与 CI 验收

GitHub 工作流 `.github/workflows/verify-php-video-api.yml` 验证 PHP 8.0 和 8.4 语法、禁止私有库匿名查看、公开视频列表、有效的 Range/206/416、非法视频 ID 和 Origin CORS。

线上另外检查 HTTPS、Nginx `client_max_body_size`、管理员上传与重登、iPhone Safari 及 Android Chrome 真实 MP4 播放与拖动。自动化验收不等于你宝塔服务器已经部署成功。

# 服务器音乐邮箱授权

浏览器、主屏幕网页和 iOS 网页容器可共用邮箱授权：播放服务器歌曲前输入自己的邮箱、收取 6 位随机授权码、验证后继续播放。弹窗也可从听屿 FM 工具菜单打开。网易云、QQ、酷狗及播客沿用各自的账户流程；Electron 不启用此网页限制。

## 服务端配置

Vercel Python 函数 `api/server-access.py` 使用 Python 标准库，不安装邮件 SDK。凭据仅配置在 Vercel 生产环境，不提交仓库，也不加 `VITE_` 前缀。

| 变量 | 配置 |
| --- | --- |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `465`，TLS |
| `SMTP_USER` | 发信 Gmail 账号 |
| `SMTP_FROM` | 邮件发件人，例如 `听屿 FM <自己的邮箱>` |
| `SMTP_PASSWORD` | Gmail 应用专用密码，不是普通账户密码 |
| `SMTP_PASSWORD_ENV_NAME` | 可选：已有 Secret 的变量名，设置后从那个变量读取密码 |
| `SERVER_ACCESS_SECRET` | 至少 32 字符的随机服务端密钥，设置为 Sensitive |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 连接 Upstash 数据库后注入；使用写入 Token |
| `SERVER_ACCESS_ORIGINS` | 可选，逗号分隔的 HTTPS 前端 Origin；默认当前 Vercel 和 GitHub Pages |

前端只需两个公开构建参数：`VITE_SERVER_ACCESS_REQUIRED=true` 开启限制；`VITE_SERVER_ACCESS_API_BASE` 指向完整 HTTPS `/api/server-access` 地址。未开启时保留原播放行为。修改变量后重新构建。GitHub Pages 的构建参数独立管理，不能运行 Python 后端。

## 约束

- 验证码有效 10 分钟，一次使用；每个挑战最多尝试 5 次。
- 同一邮箱 60 秒内不可重发，每小时最多 5 次；同一 IP 每小时 20 次，全站每天 200 次。
- 邮件发送失败不返回成功，删除对应挑战；频率配额仍计入，防止无限重试。
- 邮箱和验证码使用 HMAC 摘要保存在 Redis，挑战到期自动删除。会话有效 7 天，浏览器仅保存会话 Token 和过期时间。
- 服务端检查会话后签发 1 小时音频票据。音频网关只允许现有目录内的录音，支持 Range/206，禁止任意 URL 和重定向。音频响应及授权响应禁止缓存。
- 显式播放在读取旧缓存前检查授权；后台预加载不弹出授权窗口。取消授权不开放服务器播放。
- 此功能限制本 App 的入口及音频代理，**不会改变原始音源网站的公开访问权限**。要把源文件也设为私有，需要另外配置源站访问控制。

## 验证

自动检查：`python -m unittest discover -s test -p 'server_access_test.py'`；`npm run typecheck`；`npm run test:unit -- test/unit/onlinePlayback.test.ts test/unit/hearttraceLibrary.test.ts test/unit/onlineMusic/omniArchitecture.test.ts --testTimeout=20000`。

上线验收依次检查：实际发送邮件成功、收件人输入真实验证码、错误及过期码被拒绝、授权后音频 Range/206 和真机播放。单元测试和凭据已保存均不代表邮件已经送达。SMTP 失败日志只记录异常类型，不记录密码或验证码。

iOS 1.0.3 的「天天开心，听歌愉快」为原生本地启动公告，确认一次后不再显示。它不依赖本授权接口，也没有远程公众号跳转配置。

2026-10-25：生产环境已连接数据库并通过真实 Gmail SMTP 发信（接口 200），无会话的音频来源请求返回 401。尚未由收件人完成验证码输入，不能据此宣称投递到收件箱或授权后真机播放已通过。

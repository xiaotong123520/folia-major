# 听屿 FM iOS 工程

这是独立 UIKit + WKWebView 工程，接入现有 HTTPS 部署，不需要 npm、CocoaPods 或额外 Swift 包。现有网页、服务器曲库和部署配置没有改动。网页更新后 App 联网打开会读取新版。

## 当前交付状态

- 已准备原生入口、持久化网页存储、播放页安全区、内联播放、AirPlay 与加载失败重试。
- 已生成 Xcode 工程、共享 scheme、应用图标和构建脚本。
- 2026-10-25 已在 GitHub macOS runner 完成 Xcode archive 编译与 IPA 封装，任务成功。已检查 iPhone arm64 Mach-O 可执行文件；当前产物未签名，尚未做真机验收。
- 这是联网网页容器，不含离线前端资源。后台音频服务、原生锁屏控制没有实现；现有网页 Media Session 行为仍需真机检查。
- 平台扫码登录、应用跳转、歌词 WebGL、文件导入和音频播放均未进行 WKWebView 真机验收。不会承诺网页能用即 App 能用。
- 网页 JavaScript 自身崩溃/黑屏不会自动被 WKNavigationDelegate 捕获；本工程没有修改此前的镜台 WebGL 错误。

## iPhone App / 自签 IPA

2026-10-25 已通过 GitHub macOS runner 的 Xcode 编译与 IPA 封装，产物为 **未签名 iPhone arm64 IPA**，不是只有源码的 ZIP。

- [成功构建记录与下载入口](https://github.com/xiaotong123520/folia-major/actions/runs/40147711734)：在 Artifacts 下载 `TingyuFM-unsigned-self-sign`，解压后得到 `TingyuFM-unsigned.ipa`。下载 GitHub 构建产物可能需要登录；本次 IPA artifact 保留至 2026-11-08，过期后需重新构建。
- [iOS 工程与详细说明](https://github.com/xiaotong123520/folia-major/blob/build/ios-self-sign/packaging/ios/README.md)位于独立的 `build/ios-self-sign` 分支，尚未合并到 main；本次仅更新主分支文档。
- 最低系统为 iOS 16.0，应用标识为 `com.xiaotong123520.tingyufm`。已检查 IPA 内的 Payload、Info.plist 和 arm64 Mach-O 可执行文件；包内不含签名证书、私钥或描述文件。
- 安装：将 IPA 保存到“文件”，导入支持普通 IPA 重签的工具，用适用于目标设备的有效签名材料签名后安装。全能签、轻松签等工具尚未逐款实测，不能保证全部版本兼容；巨魔还受其自身支持的设备及系统版本限制。
- 未签名 IPA 不能直接点开安装，也不属于 TestFlight 分发包。免费 Personal Team 的 Xcode 真机安装与第三方工具重签是不同流程，具体有效期取决于使用的签名方式。

**运行范围与待验收项**：当前是 UIKit + WKWebView 联网容器，加载现有 HTTPS 网站，不含离线前端资源。网页与 App 的本地数据和登录状态不保证共用。云端编译成功不等于真机功能全部通过：平台扫码登录、跳转、播放、封面、歌词 WebGL 和文件导入仍待 App 真机验收；原生后台音频服务、原生锁屏控制尚未实现。该构建没有修复网页端镜台在无 WebGL 环境下的黑屏问题。

**公告与公众号更新弹窗**：目前仅讨论了功能方案，尚未实现；没有接入公告接口或公众号文章链接。后续实现后再更新说明。

## 自己 iPhone 免费安装

1. 在 Mac 安装完整 Xcode；打开 `TingyuFM.xcodeproj`。
2. Xcode → Settings → Accounts 登录自己的 Apple 账号，不要把账号密码放入工程。
3. Target → Signing & Capabilities → Team 选择 Personal Team，保持 Automatically manage signing。
4. 如 Bundle Identifier 冲突，将 `com.xiaotong123520.tingyufm` 改为自己唯一的标识。
5. 连接并解锁 iPhone，按提示信任设备、启用开发者模式，选择该设备并运行。
6. 免费 Personal Team 的设备安装授权 7 天到期，之后需要重新构建安装；不支持 TestFlight 分发。

## 构建与分发

在 Mac 运行 `bash build.sh` 可创建未签名 archive。脚本在无 Xcode 环境明确失败，不生成伪 IPA。

有付费开发者会员后，在 Xcode 中选择团队和设备目标，Product → Archive → Distribute App：

- TestFlight / App Store Connect：上传供测试；外部测试可能需要审核。
- Release Testing / Ad Hoc：使用登记了目标设备的分发描述文件导出签名 IPA。

免费 Personal Team 请使用上面的 Xcode Run 真机流程，不应把未签名 archive 当作可安装 IPA。当前不附任何证书、私钥或描述文件。

## 许可

本工程属于 Folia fork 的一部分，沿用仓库 AGPL-3.0；归档中附带原 LICENSE、NOTICE.md 和 CONTRIBUTORS.md。签名不代表音乐内容或第三方服务取得分发授权。

## 云端自签 IPA

`.github/workflows/ios-self-sign.yml` 在独立构建分支编译 iPhone arm64 archive，`packageUnsigned.sh` 检查真实 Mach-O 后生成 `TingyuFM-unsigned.ipa`。该产物必须由用户签名后安装；不是 TestFlight 或 App Store 分发包。下载 Actions 的 `TingyuFM-unsigned-self-sign` artifact。

## 1.0.1 播放修正测试包

针对真机反馈的 App 卡顿/不播放，将 WKWebView 媒体手势限制从 `.all` 改为 `[]`，允许用户选曲后异步解析的播放请求；不注入主动播放或恢复暂停的脚本。配置 AVAudioSession playback，在主页面实际发出媒体 play 事件时激活会话。版本升级为 1.0.1 (2)，保留应用标识；签名时请沿用设备上已安装版本的实际标识。

这些是针对配置问题的修正，不代表已证明卡顿的唯一根因，也不代表网络缓冲、Web Audio 中断或歌词渲染负载均已解决。新包仍需真机复测前台播放、切歌、暂停与锁屏行为。

## 1.0.2 后台音频配置测试包

用户真机确认旧版可以前台运行，但切后台停止播放。补充 Info.plist 的 UIBackgroundModes=audio，沿用 1.0.1 的 AVAudioSession playback 与实际 play 事件激活会话。版本为 1.0.2 (3)。该声明是后台音频必要配置，不保证 WKWebView / Web Audio 在各 iOS 版本上持续运行；尚未完成新包的锁屏、持续后台或后台切歌验收。若仍停止，需要进一步调整网页音频图或接入原生播放器，不能据此声称已支持完整原生后台播放。

## 1.0.3 启动公告

App 首次显示启动公告“天天开心，听歌愉快”，点击“开始听歌”后在当前安装中不再重复同一条公告。保留 1.0.2 后台音频配置，但后台行为仍待真机确认。公告当前内置于 App，不是远程公告服务；公众号文章跳转未接入。

邮箱授权码尚未上线：发件地址待用户确认，生产发信凭据与服务端一次性验证码存储未配置，现有服务器音频请求也尚未增加访问校验。因此当前 App 仍沿用原曲库入口，不声称已经实现服务器音乐权限保护。邮箱登录密码不应写入源码、日志、客户端环境变量或公开仓库。


## 1.1.0 原生后台接管与更新公告

前台继续使用完整网页音频图和歌词特效。切后台时把当前音频 URL 或准备好的临时音频文件交给 AVPlayer，原生播放器就绪后暂停网页音频；返回前台同步原生进度及暂停状态并恢复网页音频图。控制中心支持原生暂停、继续及进度拖动，保留远程封面。电话中断、耳机断开不会被无条件恢复为播放。

Blob 音频在前台分块复制到 App 临时目录，每份最多 64 MiB；新歌及下次启动清理 App 自己的临时副本。临时文件还未准备好时，可使用网页提供的同一授权 HTTPS 流作为过渡。只接收主框架、固定本站来源的消息，不接受任意 file URL，不记录 Cookie、票据或音源 URL。上传尚未准备完成、源站不允许原生请求或系统不支持该音频编码时仍可能无法接管，必须真机测试。

保留首次欢迎公告的原文及旧存储键。后续每次打开或加载首页读取本站 /app-updates.json，按 id 显示真实更新内容；确认后不再弹同一版本，首次安装仍只显示欢迎公告。更新公告与欢迎记录独立。网页部署必须维护公告清单，构建会校验。

后台接管当前歌曲与单曲循环；**后台整条队列自动切歌、网页均衡器与混音音效尚未迁移**。回到前台后继续使用原网页队列。这是新增后台能力的范围，不代表已经通过真机后台验收。旧安装包不能只靠刷新网页获得 AVPlayer，需要签名安装本版 IPA。

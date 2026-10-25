# 听屿 FM iOS 工程

这是独立 UIKit + WKWebView 工程，接入现有 HTTPS 部署，不需要 npm、CocoaPods 或额外 Swift 包。现有网页、服务器曲库和部署配置没有改动。网页更新后 App 联网打开会读取新版。

## 当前交付状态

- 已准备原生入口、持久化网页存储、播放页安全区、内联播放、AirPlay 与加载失败重试。
- 已生成 Xcode 工程、共享 scheme、应用图标和构建脚本。
- 当前执行环境为 Linux，无 Xcode：未执行 Swift/iOS 编译、未生成 archive、未生成 IPA、未签名、未做真机验收。
- 这是联网网页容器，不含离线前端资源。后台音频服务、原生锁屏控制没有实现；现有网页 Media Session 行为仍需真机检查。
- 平台扫码登录、应用跳转、歌词 WebGL、文件导入和音频播放均未进行 WKWebView 真机验收。不会承诺网页能用即 App 能用。
- 网页 JavaScript 自身崩溃/黑屏不会自动被 WKNavigationDelegate 捕获；本工程没有修改此前的镜台 WebGL 错误。

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

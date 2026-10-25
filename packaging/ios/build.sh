#!/bin/bash
# macOS 上构建真实的未签名 archive；不把未签名目录伪装成可安装 IPA。
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v xcodebuild >/dev/null 2>&1; then
    echo "构建未执行：需要 macOS 和完整 Xcode。当前环境没有 xcodebuild。" >&2
    exit 2
fi
xcodebuild -project TingyuFM.xcodeproj -scheme TingyuFM -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$PWD/output/TingyuFM.xcarchive" \
    CODE_SIGNING_ALLOWED=NO archive
echo "未签名 archive 已生成。此文件不能直接安装；请在 Xcode 中配置签名。"

#!/bin/bash
# 仅封装真实编译的 arm64 App，交由用户自己的工具签名后安装。
set -euo pipefail
cd "$(dirname "$0")"
app="$PWD/output/TingyuFM.xcarchive/Products/Applications/TingyuFM.app"
test -f "$app/TingyuFM"
/usr/bin/file "$app/TingyuFM" | /usr/bin/grep -q 'Mach-O'
/usr/bin/lipo -verify_arch arm64 "$app/TingyuFM"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir "$stage/Payload"
ditto "$app" "$stage/Payload/TingyuFM.app"
(cd "$stage" && ditto -c -k --keepParent Payload "$OLDPWD/output/TingyuFM-unsigned.ipa")
printf '%s\n' '这是实际编译的未签名 iPhone IPA，必须由用户自己的签名工具签名后安装。' '未做真机验收，不保证后台播放、平台登录和歌词特效全部兼容。' > output/SELF-SIGN.txt

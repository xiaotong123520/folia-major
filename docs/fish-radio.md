# Fish Audio 免费电台试听

AI 电台页面的“Fish Audio · 免费语音试听”会合成当前电台开场文案；未生成电台时使用一段欢迎词。原有浏览器播报入口保留。

## 服务端配置

在 https://fish.audio/ 注册，在 Developers / API Keys 创建 API 密钥。在 Vercel 项目的 Production 环境添加 Secret `FISH_API_KEY`，然后重新部署。不要使用 `VITE_FISH_API_KEY`，不要把密钥提交到 Git 或粘贴进聊天。已有 AI 文案密钥不能替代 Fish Audio 的密钥。

可选 `FISH_REFERENCE_ID` 指定你有权使用的音色；不填写时使用服务默认音色。音色不存在或免费模型不可用时会明确失败，不切换付费模型。

前端默认调用同源 `/api/radio-speech`。GitHub Pages 或独立静态前端需在构建时设置 `VITE_RADIO_SPEECH_API_URL=https://你的Vercel域名/api/radio-speech`；独立域名还需加入服务端 `FOLIA_ALLOWED_ORIGINS`（逗号分隔）。这项前端配置仅包含公开 URL，不含密钥。GitHub Pages 自身不能运行语音后端。

## 免费模型与播放

服务端固定发送 `model: s2.1-pro-free`，客户端无法覆盖模型、音色或上游地址。Fish 官方文档提示省略或使用未知模型名会回退到付费模型，因此本接口不接受模型配置，也不做付费重试。当前核实的免费窗口截至 2026-11-30；服务端到 2026-12-01 UTC 起会停止调用，需要重新核实官方活动后再延长，避免模型下架后被上游静默切为付费模型。公平使用规则以官方为准。

每次最多 300 个字符，超时 30 秒，响应最多 3 MiB；只接受有效音频类型。音频以私有、不缓存响应返回浏览器，不公开托管，不转发服务端密钥。页面仅在用户点击时请求，一段文案在本次预览中复用同一音频，关闭电台或更换文案会停止请求和播放并释放 blob URL。

合成后点击音频控件播放，兼容手机异步请求后的播放手势要求。试听会调用原播放器暂停动作；结束后不自动恢复歌曲，以免覆盖用户暂停。当前是独立开场试听，尚未实现锁屏下的自动串场和队列续播。

## 验证

`npm run test:unit -- test/unit/radioSpeech.test.ts test/unit/radioAgent.test.ts` 验证免费模型固定、错误及超大请求、无密钥、CORS 和无付费回退。真实音色、延迟和 iPhone 播放需配置自己的密钥后验收。

- 官方接口：https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
- 免费说明：https://fish.audio/blog/s2-1-pro-free-api/

# 小宇宙播客：公开收听与可选登录

入口：听屿 FM 工具菜单 → 小宇宙播客。播客与音乐共用原有队列和播放器，不创建第二个音频元素。

- 默认显示公开节目，不要求登录。可以粘贴完整的 `https://www.xiaoyuzhoufm.com/podcast/<id>` 或 `/episode/<id>` 链接。
- 点击“可选：扫码登录”打开原有统一登录窗口，用小宇宙 App 扫码确认。登录后可读取“我的订阅”、关键词搜索单集和按账号权限读取更多单集。
- 关闭登录窗口或退出账户，仍可打开公开节目。公开网页通常仅包含最近约 15 集，不把这个限制伪装成完整历史。
- 短链接和任意 RSS 地址暂不接受；请使用完整的小宇宙节目或单集链接。
- 付费单集依赖账号实际购买权限；接口未返回可播放音频时明确报错。

## 部署

`api-ts/podcast.ts` 是 Node 后端入口。`npm run build:vercel-api` 编译后将它与 `api-ts/xiaoyuzhou/` 的辅助模块打成单个 `api/podcast.js`，避免发布额外的辅助函数路由。仓库保留该生成入口，供 Vercel 在构建前发现路由。前端经 Omni 的 provider 调用同源 `/api/podcast`，GitHub Pages 静态站点不提供这套后端。

登录需要服务端 `PODCAST_SESSION_SECRET`（至少 32 字符）；未单独配置时使用现有服务端 `QQ_SESSION_SECRET`，经过用途隔离后派生加密密钥。不能加 `VITE_` 前缀。公开收听不需要密钥。平台 access/refresh token 只进入加密、HttpOnly、Secure、SameSite=Strict Cookie，不返回给网页，也不写日志。退出时删除会话。

构建默认不访问上游的可选提交昵称服务；确有需要时才显式设置 `FOLIA_RESOLVE_COMMIT_NAME=true`。这不影响构建提交号或音乐功能。

公开内容解析参考 RSSHub 小宇宙路由；账号操作对应 ultrazg/xyz 文档中的订阅、搜索和分页接口。扫码协议另外核对 jerryqx/dsh-xiaoyuzhou 的实现。没有把整个 RSSHub、Go 服务或 DSH 插件嵌入前端。

- https://github.com/DIYgod/RSSHub/blob/master/lib/routes/xiaoyuzhou/podcast.ts
- https://github.com/ultrazg/xyz
- https://github.com/jerryqx/dsh-xiaoyuzhou

这些是非官方接入实现，上游可能变更；作者提示第三方登录可能触发账号风控。源码测试覆盖解析、匿名读取、凭据隔离、跨源拒绝和扫码会话绑定；真实登录与播放验收须单独记录，不能由单测通过推断。

## 播客文稿与同步字幕

仅播客字幕使用平台提供的原生 transcript media ID，通过同源后端读取。文稿需要有效的小宇宙登录；公开音频仍可免登录收听。文稿不存在、未授权或请求失败时显示实际状态，可继续查看节目简介与章节，不把简介冒充字幕。

字幕沿用平台的 startMs 时间戳，接入现有播放器按句同步。平台当前返回句子级时间，没有单字时间，因此不生成虚构的逐字高亮。播客使用独立字幕转换，避免音乐歌词解析器插入省略号或改写段落。播放时直接读取播客原生文稿，跳过通用歌词缓存、历史歌词匹配结果与自动搜词，避免旧字幕覆盖正确文稿。其他音乐平台不受影响。

字幕接口和字幕 CDN 请求使用已验证的 Android 客户端参数；账号登录、订阅与音频请求保留原配置。服务端可设置 PODCAST_TRANSCRIPT_VERIFIED=false 临时关闭文稿；默认开启，无需新增密钥。

## 2026-10-24 验证记录

公开列表、免登录播放、扫码登录、账号订阅与刷新后的登录保持已实测。付费内容仍取决于账号实际权限，未单独验收购买流程。

测试单集：思文，败类《114.秋日养生指南｜emo和脱发的季节，该怎么养？》，时长约 44:33。旧客户端参数返回 6 段主题不符的文稿；更换字幕专用参数后返回 262 段，最后起始时间为 44:20.120，开头主播、主题和嘉宾与该集一致。原先显示的部分省略号来自通用歌词解析器，现已在播客转换中移除。

参考实现：
- https://github.com/r266-tech/xiaoyuzhou
- https://github.com/hesorchen/xiaoyuzhou-juicer

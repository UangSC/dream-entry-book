# 知乎 API 使用指南

本轮依据本地官方资料核对，未发起线上 API 调用。赛事资料核对日期为 2026-09-03，开放平台指南为 2026-08-25，Skill 标注 0.5.3-beta.20260904115023；历史 2026-09-12 调用记录不等于本轮复测。

## 接口与用途

| 能力 | 契约 | 本项目采用方式 |
|---|---|---|
| 比赛故事列表 | GET `https://api.zhihu.com/km-indep-home/hackathon/v2/story/list` | 制作端按需列候选，不承诺永远 20 篇 |
| 比赛故事详情 | GET 同根路径 `/story/{work_id}` | 用列表中实际 ID 获取有限节选 |
| 比赛知识 | 同根路径 `/knowledge/list`、`/knowledge/{work_id}` | 首版不用，不混用故事 ID |
| 知乎直答 | POST `https://developer.zhihu.com/v1/chat/completions` | 制作端析梦与织梦 |
| 知乎搜索 | `/api/v1/content/zhihu_search` | 后续内容发现，摘要不当原文 |
| 热榜 | `/api/v1/content/hot_list` | 后续可选，不作为可改编内容池 |
| 额度 | GET `https://developer.zhihu.com/api/v1/quota` | 需要判断额度时查询，不每请求都查 |

来源：[比赛内容 API](../zhihu/references/hackathon-content-api.md)、[HTTP API](../zhihu/references/http-api.md)、[开放平台指南](../zhihu/references/open-platform.md)。赛事接口非长期通用平台保证。

列表是 JSON 数组，详情是正文对象，不套用开放平台 Code/Message/Data 信封。`work_id` 当字符串保存，避免长整数精度丢失；拒绝斜线、问号、井号、换行，编码成单个路径段，主机固定为官方地址。允许原始响应新增字段；已知必需字段缺失则标不可制作，不编造作者或正文。

本地用户数据资料没有定义旧文档所称 `/api/v1/user/content_detail`，因此本项目不以“本人全文导入”作为已支持能力。未来接入前另找当前正式契约；也不假定有按 URL 拉取他人全文的能力。

## 鉴权与首版部署决策

比赛内容接口匿名 GET，不传 Access Secret、OAuth 或时间戳。开放平台使用 `Authorization: Bearer ...` 与秒级 Unix `X-Request-Timestamp`。文档未给出当前时间偏差窗口，撤销原文“10 分钟”的固定断言。

[官方黑客松说明](../zhihu/references/hackathon.md) 要求凭证保存在后端或安全凭证系统，不得进入前端、URL、日志、截图或仓库。本项目据此采用：

- 首版仅制作端持有 Access Secret，使用安全凭证库或进程环境变量；不将值写入命令参数、源码或构建文件。
- 玩家网页不提供 Access Secret 输入，不使用 localStorage/sessionStorage/IndexedDB 保存 Key，不使用任何 `VITE_` 密钥。
- 后续在线生成走服务器自身受控凭证、预算上限与访问控制，不能上线无认证的公开生成代理。OAuth 按官方资料另行接入；它不自动授予直答额度，也不能代替 Access Secret。
- 浏览器 CORS 即便允许，也不能据此决定将完整 API 凭证放到浏览器。历史 CORS 测试不再是首版架构前提。

## 直答请求与输出

官方仅保证 `model`、`messages`、`stream` 三个字段。模型列为 `zhida-fast-1p5`、`zhida-thinking-1p5`、`zhida-agent`，实际还受租户授权影响；前两个在资料中标明支持 role/content 上下文。首版从 fast、非流式开始。

```json
{
  "model": "zhida-fast-1p5",
  "messages": [{"role": "user", "content": "此处放任务规则、结构约束及明确分隔的故事数据。"}],
  "stream": false
}
```

采用单条 user 消息是兼容历史试验的初始策略，不声称 system 角色被平台一律忽略。不给 `response_format`、temperature、max_tokens 等未保证字段赋予必然效果。

- 成功读取 `choices[0].message.content`；不将 `reasoning_content` 当故事或公开给玩家。
- 错误结构是 `error`，不一定是 Code/Message/Data。HTTP 200 也要校验内容、finish_reason、空响应、拒绝和截断。
- 只允许去除包裹完整 JSON 的 Markdown 代码围栏等明确格式处理；不能截出一个看似合法子串就宣布成功，更不能执行模型提供的修复命令。
- 原始回复与结构化结果分别留档，去除请求凭证。故事中出现的指令仅作为文本；输出文件路径由制作工具固定。
- 将来使用 SSE 时要处理心跳、跨块 UTF-8 与 data 拼接、`finish_reason:error`、错误帧和 `[DONE]`；没有完整终止结果不发布。

## 额度、超时与重试

本地指南列当前邀测额度：直答 100/日、知乎搜索与全网搜索各 5,000/日、热榜 100/日、用户数据 10,000/日。**这不是本项目账号实测余额，也不与会员身份绑定**。同账号多 Secret 共享额度，实际以当前 quota 响应为准。

两步成功至少计划 2 次直答调用；失败、修复、截断重做可能增加调用，不承诺“100 次可做 50 个成功梦包”。额度查询不消耗业务额度，不用作每次请求的固定前置步骤。

首版客户端目标超时：内容 GET 20 秒、单次直答最长 180 秒；可配置并与实际服务网关核对。取消本地等待不代表上游不计费。

- GET 仅网络错误/可恢复 5xx 可最多重试一次并退避；认证失败、明确限流和空结果不循环请求。
- 直答 POST 默认不自动重试。超时或断连显示“结果未知，可能已消耗额度”，保留任务 ID 与已获输出，由制作者决定是否重做。
- `30001` 在官方资料中表示频率限制；没有其他证据不直接断言“日额度耗尽”。展示真实业务码，必要时手动查 quota。
- 同一故事同一制作任务只允许一个进行中的生成；重复点击返回当前任务，不再发请求。

## 来源、缓存与原文链接

缓存键至少包含 workId、sourceHash、生成配置版本；抓取时间 `fetchedAt` 与许可记录分开保存。来源变化建立新版本，不覆盖旧包依据。20 篇、约 3000 字、17 篇半句等只是历史样本，不能硬编码为接口 schema。

比赛来源发布包一律如实标有限节选，句末标点只决定末尾片段提示，不决定全文完整性；原创机制示例按自身来源单独标注。比赛资料没有提供永久缓存或无限衍生授权；是否公开、离线分发须有适用使用依据与移除方案。

`work_id` 的正式含义仅是接口内容标识，官方未承诺等于 section ID，且详情未返回 column_id。优先使用官方确实提供并核验的 URL；否则维护人工核验的 workId → 原文 URL 映射，保存核验日期。缺失时 sourceUrl=null，不拼猜测链接。

保留真实 URL 的现有 query；需要来源统计时合并项目 UTM，不删除原参数。链接校验协议、主机，站外打开使用 noopener/noreferrer。首版不加第三方行为追踪；仅 UTM 不能证明已产生阅读或付费转化。

## 玩家和制作者可见错误

| 状态 | 界面行为 |
|---|---|
| 故事未制作 | 显示“暂未开放”，不把目录条目当可玩包 |
| 无网络/资源失败 | 已缓存故事继续玩，提供重试；不伪造新内容 |
| 生成被拒绝 | 制作端停止该材料，选择其他合适故事 |
| 生成 JSON 不合格 | 制作端列出具体字段错误，状态回 draft |
| 待审读 | 不进入公共可玩库；审核不通过不会影响已有已发布包 |
| 原文链接缺失 | 梦醒照常完成；说明直链待补充并提供可选搜索 |

历史材料的纠正原因见 [HISTORY_AND_PITFALLS.md](HISTORY_AND_PITFALLS.md)。

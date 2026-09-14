# 知乎接入复核与产品实施建议

> **当前部署更新：** 下文保留早期排查证据，不作为当前配置指南。用户已取得并配置赛事凭据；本地代码已适配新版 `/user` 和前端跳转方案，仍待部署后真实授权验收。当前回调为 `https://uangsc.github.io/dream-entry-book/oauth-callback.html`，真实登录采用不依赖第三方 Cookie、可跨 FC 实例验证的短期应用会话。下文旧 `/api/auth/callback`、资料占位和内存登录限制只描述历史版本，最新步骤以 [FC 部署说明](../FC_DEPLOYMENT.md) 为准。

> **2026-09-14 后续更正：下文关于黑客松 `state` 和基础资料协议缺失的结论已被新版官方 Skill 补齐。** 本地 Skill 为 `0.5.3-beta.20260904115023`；状态检查发现新版 `0.7.2-beta.20260911131715`，读取并验证官方包 SHA-256 后确认：黑客松 OAuth 已支持 `state` 原样透传；基础信息为 `GET https://openapi.zhihu.com/user`，仅使用 OAuth Token 的 Bearer 鉴权，字段为 `uid/hash_id/fullname/avatar_path` 等。当前剩余工作是领取并配置赛事 App ID/App Key、登记回调、按新版协议修正资料适配并实测登录。旧文与旧通用 OAuth 实测不能覆盖新版黑客松说明。此前仅检查旧本地资料和通用官网页面，未检查 Skill 更新，导致判断不完整。
>
> 官方包：[0.7.2 版 Skill](https://developer-cdn.zhihu.com/zhihu-cli/releases/beta/skill/0.7.2-beta.20260911131715/zhihu-cli-skill-0.7.2-beta.20260911131715.zip)，依据为其中 `references/hackathon-oauth.md` 和 `references/hackathon-user-profile-api.md`。此次仅下载核对，未安装升级本地 Skill。
>
> **产品优先级补充：** 用户明确希望以真实 AI 制作为主线，将完整原文解析、个性化分支续写和素材生成串成可重复的制作流程。同一篇原文可基于用户偏好与游玩选择生成不同版本；结局讨论与原作回流作为配套能力。下文先做讨论入口的建议不再代表最新优先级。

复核日期：2026-09-14。范围：当前仓库、关联任务记录、知乎官网当前文档及官方直答 Skill 下载包。本文区分已实现、已验证和建议开发的能力；不代表正式 OAuth 已联调成功。

## 结论

OAuth 未完成不能简单归因于文档不够：当前进程环境没有配置独立的 OAuth App ID、App Key，运行模式默认是 `mock`；用户基本资料适配仍是占位实现，回调关联协议尚未完成联调。Access Secret 已配置且有效，它足够支持搜索、直答、热榜等通用 API，但不能代替第三方登录凭据。

项目已经接入官方故事目录、知乎搜索和真实直答分析。体验与回流仍弱的主要原因，是能力集中在“新增入梦书”弹窗和任务报告，尚未把玩家刚经历的选择与知乎原文、作者和真实讨论连接起来。建议先完善这条用户路径，再扩展接口数量。

## 本轮证据

| 检查 | 结果 | 含义 |
| --- | --- | --- |
| 最初引用的历史任务 `01a09c5c-d515-7be0-8948-036a01b6bbed` | 只包含一次中断的提交仓库请求 | 单靠该任务无法解释 OAuth；进一步找到同项目后续接入记录 |
| 当前环境 | `OAUTH_MODE` 未显式设置，默认 `mock`；App ID、App Key、资料 URL 均未配置 | 未发现可直接启动真实授权的配置；不代表用户尚未在平台获得凭据 |
| 本地后端 | 检查时 `127.0.0.1:62561` 无法连接 | 当时账号和 API 代理服务没有响应，是独立于 OAuth 的运行问题 |
| Access Secret | 从现有凭据来源读取，额度接口 HTTP 200、`Code=0` | 凭据目前有效；没有回显密钥 |
| 额度快照 | 搜索 4,998/5,000，直答 4,999/5,000；知识库 500/500 | 本轮仅查询额度，不消耗业务额度，未重新调用搜索或直答 |
| 后端回归 | `python -m pytest backend -q`：7 项通过 | 覆盖现有模拟登录和 API 适配等逻辑，不证明真实 OAuth 成功 |
| 官方文档 | 从官网页面引用的数据接口读取当前公开正文 | 当前 OAuth 页仍缺少基本用户资料端点与 `state` 回传说明 |

代码依据：`backend/app.py` 的 `Settings`、`auth_start`、`exchange`、`callback`；`backend/zhihu_api.py` 的 `ZhihuGateway`；`src/components/ZhihuSources.tsx`。

关联任务：实际接入进展见 `codex://threads/01a09c0a-d116-7152-b121-bf3fb9e9f787`。其中记录了上一轮真实目录、搜索和直答报告的验证；这些历史结果与本轮免费额度查询分别陈述。

### 中断恢复后的核对

2026-09-14 从 `codex://threads/01a09d61-fb46-7a91-8d31-9f17d858d333` 恢复：该任务在写入本文及关联说明后失败，没有完成最终交付。此次保留已有文档改动，并完成以下检查：

- 当前进程仍默认 `mock`；OAuth App ID、App Key、用户资料 URL 均未配置，Access Secret 可从现有来源读取。仅检查配置是否存在，没有输出凭据值。
- 使用上一任务下载的官方 OAuth 正文核对授权、换 Token、申请邮箱与材料清单；此处不是一次新的官网抓取或真实授权联调。
- 后端回归重新执行，7 项全部通过；有 2 条第三方依赖弃用警告，无测试失败。文档差异空白检查通过。
- 额度数字保留为上一任务的查询快照；此次未重新查询额度或调用收费业务接口。

本次完成的是 OAuth 原因排查、接入资料修订和产品实施方案。下面的结局讨论、角色问答与热榜推荐仍是待开发功能。

## OAuth 具体缺什么

### 已符合当前官方说明的部分

- 跳转 `https://openapi.zhihu.com/authorize`，传 `app_id`、`response_type=code` 和 `redirect_uri`。
- 回调优先读取 `authorization_code`，向 Token 接口发送时字段名为 `code`。
- 后端以表单 POST 到 `https://openapi.zhihu.com/access_token`，传 `app_id/app_key/grant_type/redirect_uri/code`。
- 授权码交换、应用密钥和用户令牌均在服务端处理。
- 本项目回调路径为 `/api/auth/callback`，不能直接把作品首页代替该路径。登记 URL 与发起、换 Token 使用的 URL 应完全一致。

### 待补齐的部分

1. **独立应用凭据。** 核对赛事项目页是否已经分配；若采用普通应用申请，当前官方邮箱为 `openplatform@zhihu.com`。旧本地文档邮箱和申请材料已修订。
2. **可访问且登记一致的回调。** 当前默认本地地址不等于已经登记公网回调。部署时应让 `/api` 同源代理到后端，并配置 `APP_ORIGIN`。
3. **基本用户资料协议。** 官网这篇文档提到“获取用户信息”，但没有给出 URL、鉴权方式、稳定用户 ID 字段及响应结构。当前代码的 `ZHIHU_PROFILE_URL`、`id/name/avatar_url` 解析只是适配位置。用户内容列表接口也不能替代身份确认接口。
4. **回调关联。** 当前代码要求浏览器 Cookie 和 `state` 同时匹配。官方示例未说明 `state`，旧跨项目记录称不回传，但本项目尚未实测。先向平台确认并验证；不通过删除检查来宣称完成登录。
5. **完整联调。** 用户在知乎页面完成授权后，验证身份、过期、取消、错误回调、重复使用授权码及退出。只有模拟测试通过不能算第三方登录完成。

当前用户内容 API 明确支持 `Authorization: Bearer <Access Secret>`、`X-OAuth-Token: <用户令牌>`、`X-Request-Timestamp` 的组合；这不能自动证明尚未文档化的“基本用户资料接口”采用完全相同协议。

### 可直接整理给平台的申请内容

- 收件人：`openplatform@zhihu.com`
- 主题：`入梦书申请接入知乎 OAuth 服务`
- 应用名称：入梦书
- 简介：面向知乎故事读者与创作者的互动阅读产品，将获得授权的故事制作成可参与选择的叙事体验，并保留原作、作者及讨论入口。
- 图标：附至少 256×256 的正式图标。
- 回调：`https://<实际作品域名>/api/auth/callback`，提交前替换为真实部署地址。
- 申请人姓名、手机号、知乎主页：由申请人填写。
- 权限：如计划接入公开收藏夹和创作选书，申请 C“公开内容”；邮箱、手机并非当前功能必需，不默认申请。仅登录所需的基础身份权限请平台明确。
- 联调问题：请提供基本用户信息接口 URL、鉴权与响应示例，以及 `state` 原样回传或其他授权请求绑定机制的说明。

以上为申请草稿，本轮未向平台发送邮件。

## 当前产品差距

“新增入梦书”已经有官方目录和搜索；直答只做最多 12,000 字的线索分析，长故事只取开头。模拟制作仍复制示例书包。它们不足以支撑“任意盐选故事一键变游戏”的承诺，也没有自然促使完成游戏的人继续访问知乎。

另外，搜索和分析目前要求本地账号会话，这是项目的任务归属及调用控制设计，不是知乎通用 API 强制要求用户 OAuth。后续可以用独立的受限游客会话提供体验，不必把通用能力开发堵在 OAuth 上；开放访客调用前仍需保留配额和防滥用控制。

## 建议的实施顺序

### 第一阶段：把结局与知乎社区接起来

优先在现有终幕、梦签或“关于这场梦”弹窗中加入“梦醒后，听听别人的选择”，保持阅读中的主布局不变。

一次完整体验：

1. 玩家完成一个结局。
2. 根据已经发生的选择，展示一句可讨论的问题，例如“为了活下去伤害别人，责任该如何判断？”；这只是查询示例，不冒充已有知乎问题。
3. 用户点击后，调用知乎搜索取 3–5 条真实讨论；展示作者、摘要和来源链接。
4. 如果选中的是问题，可按需调用问题回答 API 展示少量不同回答的摘要；无相关内容时明确为空，不生成假讨论。
5. 并列保留“读原作”“看作者”“去知乎参与讨论”。保留 API 返回 URL 中的溯源 UTM 参数，讨论点击不替用户发布内容。

复用现有后端请求、缓存与额度逻辑，扩展能力预算；前端复用弹窗。可以先做“搜索＋原作入口”，随后再接问题回答，避免一次接入过多能力。

验收：任一结局能主动打开相关真实内容；作者和链接与返回结果一致；无结果、额度不足和离线不影响结局阅读；前端没有密钥。先统计入口展示、点击和用户侧完成率，外链点击不宣称为知乎落地页阅读或付费转化。

### 第二阶段：知识库支持角色问答和制作

把“问问这个角色”和创作者制作台共用的故事依据建立起来：

- 使用明确授权且完整的故事正文建立人物关系、时间线和章节资料，绑定 `book_id`、版本及知识库 ID。
- 通过知识库检索获得相关片段，再交给直答解释人物动机、检查分支冲突或回答读者的问题。
- 回答显示原文依据；区分原作事实、玩家路线事实与改编推测。检索不足时说明材料不足，不补造结局。
- 已通关玩家可问“他为什么这样选”；阅读中问答只使用已解锁内容。知识库检索当前没有文档化的章节权限筛选参数，需应用侧隔离检索范围或校验片段，不能只靠提示词防剧透。
- 先初始化直答知识库，并选定允许用于产品的知识库。后台持有的 Access Secret 代表运营者；不能把 `RecallScopes=["personal"]` 无差别开放给所有玩家，也不能据此读取玩家自己的知识库。

检索返回片段不代表已经取得整部小说。制作完整游戏仍需全文准备、章节骨架、分支结构化、现有图校验与审读，不能用一次分析报告替代。

### 第三阶段：发现下一场梦

| 能力 | 对入梦书的用途 | 优先级与边界 |
| --- | --- | --- |
| 知乎搜索 | 原作、作者、同题材故事与结局讨论 | 最高；已有适配可复用 |
| 直答 | 角色问答、分歧解释、制作辅助 | 高；回答与原文证据结合 |
| 知识库检索 | 人物和时间线一致性、故事内问答 | 高；先有完整资料、初始化与明确范围 |
| 问题回答 | 在结局后比较社区不同观点 | 中高；返回摘要，不是全文或自动评论功能 |
| 热榜 | 书架里的少量“今日议题”，连接已制作且相关的故事 | 中；从缓存按需刷新，不能把全部热点硬塞进古风剧情 |
| 全网搜索 | 制作端补充时代、地理、民俗资料 | 较低；主要服务考据，不能取代知乎社区来源 |
| OAuth＋公开收藏/创作列表 | 玩家从自己收藏或创作中选故事 | 独立推进；先完成凭据和身份联调，列表通常只有摘要 |

官网另有“我的创作全文 API”，但当前明确仅支持 Access Secret 所属账号，**不接受 OAuth 身份切换**，也不支持任意盐选付费小说全文。不能将它设计成所有登录用户的一键全文导入接口。

热榜若采用一小时共享缓存，单进程只在有访问时刷新，正常连续使用约 24 次/日；每位玩家或每次刷新各打一遍接口会迅速耗尽 100 次日额度。多实例部署还需共享缓存和预算，不能沿用单进程假设。

## Skill 参数与 HTTP API 的区别

官方 Skill 是命令行包装层。下载或安装它，不等于网页已经拥有该功能。生产 Web 应用可直接复用现有 FastAPI 网关调用 HTTP API。

| 能力 | HTTP 端点（均基于 `https://developer.zhihu.com`） | 关键参数 |
| --- | --- | --- |
| 知乎搜索 | `GET /api/v1/content/zhihu_search` | `Query`、`Count`；不是 Skill 的小写 `query/count` |
| 全网搜索 | `GET /api/v1/content/global_search` | `Query`、`Count`、`Filter`、`SearchDB` |
| 热榜 | `GET /api/v1/content/hot_list` | `Limit` |
| 直答 | `POST /v1/chat/completions` | `model`、`messages`、`stream`；Skill 将 `query` 转换为 `messages` |
| 知识库检索 | `POST /api/v1/knowledge/search` | `Query`、`KnowledgeBaseIDs`、`RecallScopes`、`Limit` |
| 问题回答 | `GET /api/v1/content/question_answers` | `QuestionUrl`、`Offset`、`Limit` |
| 额度 | `GET /api/v1/quota` | 可选 `APIIDs`，查询本身不消耗业务额度 |

统一鉴权为服务端 Bearer Access Secret 和秒级时间戳；按接口规定设置 Content-Type。官方直答脚本已确认现有代码使用的 `messages` 形式正确，不应照抄 Skill 的 `query/output` 到 HTTP Body。`output=text` 是包装层输出选项，不是当前直答 API 保证支持的请求字段。

## 官方依据

- [OAuth 应用集成](https://developer.zhihu.com/docs?key=zhihu_oauth_integrated)
- [知乎搜索 API](https://developer.zhihu.com/docs?key=zhihu_search)
- [直答 API](https://developer.zhihu.com/docs?key=zhida)
- [官方直答 Skill 下载包](https://developer.zhihu.com/download/zhida_skills.zip)
- [全网搜索 API](https://developer.zhihu.com/docs?key=global_search)
- [热榜 API](https://developer.zhihu.com/docs?key=hot_list)
- [知识库检索 API](https://developer.zhihu.com/docs?key=knowledge_search)
- [问题回答 API](https://developer.zhihu.com/docs?key=question_answers)
- [我的创作全文 API](https://developer.zhihu.com/docs?key=user_content_detail)
- [用户内容 API](https://developer.zhihu.com/docs?key=user_contents)
- [额度查询 API](https://developer.zhihu.com/docs?key=quota)

本轮修订接入资料并形成实施建议，未修改业务代码、切换真实 OAuth、部署公网服务或宣称上述建议功能已经实现。

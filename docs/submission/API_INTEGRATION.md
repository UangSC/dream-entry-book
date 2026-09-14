# 知乎 API 研究与接入说明

核验日期：2026-09-14。此说明用于维护和联调，评审计划书请使用 `PRODUCT_PLAN.md`。

同日补充复核见 [OAuth 诊断与产品实施建议](ZHIHU_INTEGRATION_REVIEW.md)：Access Secret 已验证有效；新版官方 Skill 已明确黑客松 `state` 透传与 `/user` 基础资料协议，独立凭据配置、代码适配及真实联调仍待完成。下面“已落地”与“额度实测”保留上一轮接入结果；热榜、知识库及结局讨论入口属于后续建议。

## 已落地的入口

“新增入梦书”弹窗增加“官方故事”和“在知乎找找”。目录可直接浏览；登录后按按钮搜索或把官方故事带入线索分析。任务由 FastAPI 异步执行，在头像内的“织梦任务”查看进度和报告。阅读主画面未增加搜索栏或其他常驻区域。

线索分析使用真实知乎直答，输出人物动机、冲突、分歧建议及演出氛围。完整游戏自动生成尚在建设，“制作流程演示”继续使用明确标注的示例书。分析报告不能伪装成 `.dreambook` 入架。

## 研究依据

- 项目 `zhihu/SKILL.md` 与 `zhihu/references/hackathon.md`：赛事场景与官方 CLI 使用方式。
- `zhihu/references/hackathon-content-api.md`：活动故事目录和详情。
- `zhihu/references/http-api.md`、`open-platform.md`：搜索、直答、鉴权、额度。
- `zhihu/references/hackathon-oauth.md`：独立的 Authorization Code 登录流程。
- 用户提供的 [官方 quickstart](https://www.zhihu.com/ring/moltbook/api/community/quickstart) 在本次环境返回 403，浏览器跳转登录，未读取到正文。因此没有把未确认的参数或协议作为事实。

活动故事接口不视为长期平台承诺；上线前应确认当期活动内容的适用范围。搜索返回摘要，普通盐选链接不构成获取任意付费全文的授权或技术凭据。

## 官方端点

| 功能 | 接口 | 鉴权与处理 |
| --- | --- | --- |
| 官方目录 | `GET https://api.zhihu.com/km-indep-home/hackathon/v2/story/list` | 不携带 Secret；一小时缓存 |
| 官方详情 | `GET https://api.zhihu.com/km-indep-home/hackathon/v2/story/{work_id}` | 仅允许目录中实际返回的 ID；保留作者及内容来源 |
| 知乎搜索 | `GET https://developer.zhihu.com/api/v1/content/zhihu_search` | `Query`、`Count=5`；Bearer Secret 与秒级时间戳 |
| 直答 | `POST https://developer.zhihu.com/v1/chat/completions` | `model=zhida-fast-1p5`、`messages`、`stream=false`；同上鉴权 |

不根据故事 ID 猜原文 URL。上游未提供原文链接时保留真实 API 来源；搜索保留合法知乎 HTTPS 链接和原有来源参数，摘要纯文本显示。

## 额度实测

用户页面中的 `0 / 5000` 经 CLI `quota` 证实表示已用 0、总额 5000，不能理解为剩余为 0。

本轮总计：凭据验证读取本人数据 1 次、知乎搜索 2 次、直答 1 次。没有调用热榜、全网搜、创作、知识库和小工具。目录与详情不使用 Access Secret，不计入上述业务额度。最终只读额度查询返回：

| 能力 | 总额 | 已用 | 剩余 |
| --- | ---: | ---: | ---: |
| 全网搜 | 5000 | 0 | 5000 |
| 知乎搜索 | 5000 | 2 | 4998 |
| 热榜 | 100 | 0 | 100 |
| 问题回答 | 100 | 0 | 100 |
| 用户数据 | 10000 | 1 | 9999 |
| 创作能力 | 100 | 0 | 100 |
| 直答 | 5000 | 1 | 4999 |
| 知识库 | 500 | 0 | 500 |
| 小工具 | 10 | 0 | 10 |

该表是核验时的共享额度快照，其他应用、网页测试或 Secret 的调用都会改变它。

## 调用控制与保存

- 搜索只在提交时触发，每次最多五条；每用户三秒冷却。相同搜索和分析缓存半小时、并发合并，缓存最多 128 项。
- SQLite 按北京时间自然日原子预留本项目预算，默认搜索每日 100 次、分析每日 20 次。环境变量 `ZHIHU_SEARCH_DAILY_LIMIT`、`ZHIHU_ANALYSIS_DAILY_LIMIT` 可调整。它不是对账户剩余额度的实时同步；上游仍可能因其他调用提前耗尽。
- 分析最多发送 12,000 字；超长官方故事只取开头，并在界面说明。模型提示区分原文事实和改编建议，不续写锁定正文。
- 失败不自动重试。本地预算保守计入失败尝试；真实任务中断后标记失败，用户可手动重试。模拟任务保持原有重启恢复逻辑。
- 任务、结果和来源按登录身份隔离，列表只显示最近七天，过期任务及产物在服务启动时清理。业务队列仍单进程运行，缓存及 mock 内存会话随重启失效；真实 OAuth 已使用短期签名应用会话支持跨实例验证，但任务、记录和预算未迁移到共享存储，见 [FC 部署说明](../FC_DEPLOYMENT.md)。

## 凭据与启动

用户提供的 Access Secret 已保存在当前 Windows 用户凭据库，目标名 `rumengshu/zhihu-access-secret`；未写入代码、前端、SQLite 或提交文档。后端优先读取环境变量 `ZHIHU_ACCESS_SECRET`，没有时再读 Windows 凭据库。

本地需要重新配置时执行：

```powershell
.venv\Scripts\python -m backend.credentials
```

输入无回显。服务进程需以保存凭据的同一 Windows 用户启动；其他服务器使用部署环境的密钥配置。环境更改后重启后端：

```powershell
.venv\Scripts\python -m uvicorn backend.app:app --host 127.0.0.1 --port 62561
```

真实知乎登录仍需要独立的 OAuth App ID、App Key、回调和资料协议联调。当前使用本地模拟身份体验账号服务；Access Secret 不代替用户 OAuth Token。公网发布前切换真实授权，具体见 `backend/README.md`。

## 验收与限制

真实请求通过本地 Vite 同源代理访问 FastAPI：目录 20 项、搜索 5 项；选取官方故事详情建立真实后台任务，成功返回 582 字直答报告。报告类型、作者与来源保存正常。

后端 7 项测试通过，覆盖缓存、额度、错误收敛、身份隔离、真实任务报告、拒绝报告入架及中断不自动重复请求；前端 376 项测试通过，构建、发布检查与 102 资源离线检查通过。

本轮浏览器控制工具返回认证方式不支持，未完成新增弹窗视觉复核。前轮正式三线七终幕桌面验收仍有效；本轮没有做移动端适配或测试。

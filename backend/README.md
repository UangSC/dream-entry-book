# 账号与织梦服务

运行命令见根目录 README。数据库默认 `backend/data/dreams.sqlite3`，任务产物位于 `backend/data/results/`，均不提交 Git。SQLite 使用 WAL；记录查询最多返回最近七天每类 100 项，启动时清理过期记录与产物。

## 模拟授权与任务

默认 `OAUTH_MODE=mock`。走完整 Authorization Code 流程：开始授权→本地同意页→一次性授权码→服务端回调兑换→HttpOnly 会话 Cookie。`state` 与发起浏览器绑定，授权码单次、短期有效；同名模拟昵称对应同一模拟身份。

模拟后台队列按五阶段推进，支持取消、重试、三个活动任务上限、进程重启续跑。模拟结果复制正式小妖怪书包并设置独立 ID 和 `simulation` 标记，不分析或改写提交的小说。浏览器下载结果后仍执行原有 `.dreambook` 严格校验，成功才入架。可用 `MOCK_STAGE_SECONDS` 调整阶段耗时，默认 2 秒。

会话和平台 Token 只存服务端内存，重启需要重新登录；游玩、任务、入架记录保留。当前为单进程队列，请使用一个 Uvicorn worker。书签正文和恢复状态仍在浏览器，后端游玩记录是章节/终幕足迹，不提供跨设备续读。

## 内容 API 与真实分析

另支持 `mode=analysis` 的真实知乎直答任务：接收最多 12,000 字片段，返回人物、冲突与分歧建议报告，`result_kind=analysis`。报告保留作者、来源，不可作为书包入架。进程中断的真实分析标记失败，由用户手动重试，避免自动重复耗费额度。报告与任务同样只保留最近七天。

官方活动故事目录/详情无需 Access Secret。搜索和直答优先从 `ZHIHU_ACCESS_SECRET` 读取凭据；Windows 未设置时读取当前用户凭据库的 `rumengshu/zhihu-access-secret`。运行 `.venv\Scripts\python -m backend.credentials` 可无回显保存。客户端仅收到结果，健康检查仅显示是否配置。

默认本地每日预算：搜索 100 次、分析 20 次，可用 `ZHIHU_SEARCH_DAILY_LIMIT`、`ZHIHU_ANALYSIS_DAILY_LIMIT` 调整；它们不是知乎账户的共享剩余额度。目录/详情缓存一小时，搜索和分析缓存半小时，相同内容并发合并；失败不自动重试。详见 `docs/submission/API_INTEGRATION.md`。

## 真实知乎 Authorization Code 配置

参考项目 `zhihu/references/hackathon-oauth.md`，没有调用 CLI 中的登录凭据。

```powershell
$env:OAUTH_MODE = 'zhihu'
$env:APP_ORIGIN = 'https://你的前端域名'
$env:ZHIHU_OAUTH_APP_ID = '平台分配的应用 ID'
$env:ZHIHU_OAUTH_APP_KEY = '平台分配的应用密钥'
$env:ZHIHU_ACCESS_SECRET = '平台分配的访问密钥'
$env:ZHIHU_PROFILE_URL = 'https://平台确认的用户资料端点'
.venv\Scripts\python -m uvicorn backend.app:app --host 127.0.0.1 --port 62561
```

密钥仅在服务端读取，不写入前端或仓库。实际替换示例值后启动。回调地址配置为 `${APP_ORIGIN}/api/auth/callback`。已适配 `https://openapi.zhihu.com/authorize` 和 `https://openapi.zhihu.com/access_token`，授权回调兼容 `authorization_code`/`code`；用户资料调用使用 Access Secret、OAuth Token、请求时间戳组合。

**真实授权未联网验收**：现有文档缺少确定的用户资料 URL/响应协议，且历史记录显示回调可能不回传 `state`。当前要求平台回传原始 `state`，缺失则拒绝；不会为了兼容而关闭校验。资料适配暂接收顶层或 `data` 下的 `id`、`name`、`avatar_url`，需平台确认后调整。配置缺失时返回 503，不能视为已经完成真实知乎登录。

## 接口

| 路径 | 功能 |
| --- | --- |
| GET `/api/health` | 健康状态和模拟标记 |
| GET `/api/auth/start`、`/api/auth/callback` | 授权发起与兑换 |
| GET `/api/session`、`/api/me` | 可选会话、受保护用户资料 |
| POST `/api/auth/logout` | 注销会话 |
| GET `/api/account` | 最近七天三类记录 |
| POST `/api/plays` | 按周目更新足迹 |
| GET `/api/zhihu/stories`、`/api/zhihu/stories/{id}` | 官方故事目录与详情 |
| GET `/api/zhihu/search?q=...` | 登录后搜索知乎摘要 |
| POST `/api/jobs` | 建立模拟书或真实分析任务 |
| POST `/api/jobs/{id}/cancel`、`retry` | 取消与重试 |
| GET `/api/jobs/{id}/result` | 下载自己的成功任务产物 |
| POST `/api/imports` | 登记成功入架 |

写操作要求 `Origin` 等于 `APP_ORIGIN`，所有 API 禁止缓存；HTTPS 部署 Cookie 自动启用 Secure。未登录、其他用户、过期和未成功的任务不能下载产物。

测试：`.venv\Scripts\python -m pytest backend -q`。覆盖授权关联/单次码/注销/来源校验、账号隔离、七天过滤、实际可下载产物、取消重试限制和重启恢复。

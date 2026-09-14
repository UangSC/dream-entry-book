# 账号与织梦服务

阿里云 FC 的 Python 3.12 代码包、依赖层、素材层与控制台配置见 [FC 部署说明](../docs/FC_DEPLOYMENT.md)。使用 `backend.fc:app` 入口；它禁止读取 dotenv 文件，临时数据写入 `/tmp`。本地启动仍使用下文原入口。

运行命令见根目录 README。数据库默认 `backend/data/dreams.sqlite3`，任务产物位于 `backend/data/results/`，均不提交 Git。SQLite 使用 WAL；记录查询最多返回最近七天每类 100 项，启动时清理过期记录与产物。

## 模拟授权与任务

默认 `OAUTH_MODE=mock`。走完整 Authorization Code 流程：开始授权→本地同意页→一次性授权码→服务端回调兑换→HttpOnly 会话 Cookie。`state` 与发起浏览器绑定，授权码单次、短期有效；同名模拟昵称对应同一模拟身份。

模拟后台队列按五阶段推进，支持取消、重试、三个活动任务上限、进程重启续跑。模拟结果复制正式小妖怪书包并设置独立 ID 和 `simulation` 标记，不分析或改写提交的小说。浏览器下载结果后仍执行原有 `.dreambook` 严格校验，成功才入架。可用 `MOCK_STAGE_SECONDS` 调整阶段耗时，默认 2 秒。

模拟授权的会话只存服务端内存，重启需要重新登录；本地磁盘中的游玩、任务、入架记录保留，FC 临时磁盘则没有持久化保证。当前为单进程队列，请使用一个 Uvicorn worker。书签正文和恢复状态仍在浏览器，后端游玩记录是章节/终幕足迹，不提供跨设备续读。

## 内容 API 与真实分析

另支持 `mode=analysis` 的真实知乎直答任务：接收最多 12,000 字片段，返回人物、冲突与分歧建议报告，`result_kind=analysis`。报告保留作者、来源，不可作为书包入架。进程中断的真实分析标记失败，由用户手动重试，避免自动重复耗费额度。报告与任务同样只保留最近七天。

官方活动故事目录/详情无需 Access Secret。搜索和直答优先从 `ZHIHU_ACCESS_SECRET` 读取凭据；Windows 未设置时读取当前用户凭据库的 `rumengshu/zhihu-access-secret`。运行 `.venv\Scripts\python -m backend.credentials` 可无回显保存。客户端仅收到结果，健康检查仅显示是否配置。

默认本地每日预算：搜索 100 次、分析 20 次，可用 `ZHIHU_SEARCH_DAILY_LIMIT`、`ZHIHU_ANALYSIS_DAILY_LIMIT` 调整；它们不是知乎账户的共享剩余额度。目录/详情缓存一小时，搜索和分析缓存半小时，相同内容并发合并；失败不自动重试。详见 `docs/submission/API_INTEGRATION.md`。

## 真实知乎 Authorization Code 配置

普通应用以 [当前官方 OAuth 说明](https://developer.zhihu.com/docs?key=zhihu_oauth_integrated) 为准；赛事分配凭据的入口另参考项目 `zhihu/references/hackathon-oauth.md` 并在赛事页核实，没有调用 CLI 中的登录凭据。具体配置缺项及申请草稿见 [接入复核](../docs/submission/ZHIHU_INTEGRATION_REVIEW.md)。

```powershell
$env:OAUTH_MODE = 'zhihu'
$env:APP_ORIGIN = 'https://你的前端域名'
$env:API_ORIGIN = 'https://你的后端域名'
$env:FRONTEND_URL = 'https://你的前端域名/项目路径/'
$env:ZHIHU_OAUTH_APP_ID = '平台分配的应用 ID'
$env:ZHIHU_OAUTH_APP_KEY = '平台分配的应用密钥'
$env:ZHIHU_ACCESS_SECRET = '平台分配的访问密钥'
$env:ZHIHU_PROFILE_URL = 'https://openapi.zhihu.com/user'
.venv\Scripts\python -m uvicorn backend.app:app --host 127.0.0.1 --port 62561
```

密钥仅在服务端读取，不写入前端或仓库。真实授权回调为 `${FRONTEND_URL去掉末尾斜杠}/oauth-callback.html`，当前 Pages 地址为 `https://uangsc.github.io/dream-entry-book/oauth-callback.html`。`FRONTEND_URL` 未设置时使用 `APP_ORIGIN/`；`API_ORIGIN` 未设置时兼容本地同源代理并回退到 `APP_ORIGIN`。`APP_ORIGIN` 与 `API_ORIGIN` 只填写域名，`FRONTEND_URL` 可以包含项目路径。

浏览器 POST `/api/auth/start` 获取授权地址后自行跳转 `https://openapi.zhihu.com/authorize`，知乎回到独立的静态回调页。回调页先清除地址栏授权参数，再 POST `/api/auth/exchange`；FC 调用 `https://openapi.zhihu.com/access_token` 兑换授权码并读取 `/user`，返回短期应用会话，浏览器自行返回首页。兼容 `authorization_code` 或 `code`，拒绝重复参数。FC 全程返回 JSON，不执行站外 3xx。

前端生成 state 和 verifier，仅把 challenge 交给 FC，后端签发有效十分钟的 transaction。回调同时校验 state、verifier 和签名请求证明；这属于本项目的请求绑定机制，不表示知乎支持 PKCE。授权码单次兑换由知乎保证。前端先消费本次登录记录，失败需从首页重新发起。

应用会话存于标签页 `sessionStorage`，通过 `Authorization: Bearer` 发送，最长有效一小时，不包含知乎 OAuth Token。真实登录不依赖第三方 Cookie，同一签名配置下不同 FC 实例可验证。`APP_SESSION_SECRET` 可选，未填写时从 `ZHIHU_OAUTH_APP_KEY` 派生独立用途签名键；填写时使用专用随机秘密且各实例一致。退出清除当前浏览器会话，当前没有全局撤销名单，复制出的凭据在到期前仍有效。轮换用于签名的秘密会使旧会话失效。

**真实授权未联网验收**：本地代码已按官方 Skill `0.7.2` 的黑客松协议修正基础资料请求：`GET https://openapi.zhihu.com/user`，仅使用 OAuth Token 的 Bearer 鉴权，读取 `uid/hash_id/fullname/avatar_path`；用户 ID 在 Python 中无损解析后以字符串返回。仅登录和基础资料不依赖 Access Secret，搜索和直答仍需要它。应用凭据缺失时返回 503。HTTP 模拟测试通过不代表真实知乎登录成功，本轮改动尚未部署。

## 接口

| 路径 | 功能 |
| --- | --- |
| GET `/api/health` | 健康状态和模拟标记 |
| POST `/api/auth/start` | 返回真实授权 URL 和签名请求证明；mock 返回模拟入口 |
| POST `/api/auth/exchange` | 验证浏览器请求，服务端兑换授权码，返回应用会话 |
| GET `/api/auth/start`、`/api/auth/callback` | 仅保留本地 mock 授权；真实模式返回 409 |
| GET `/api/session`、`/api/me` | 可选会话、受保护用户资料 |
| POST `/api/auth/logout` | 清理当前实例会话；前端同时删除应用会话，不提供全局签名凭据撤销 |
| GET `/api/account` | 最近七天三类记录 |
| POST `/api/plays` | 按周目更新足迹 |
| GET `/api/zhihu/stories`、`/api/zhihu/stories/{id}` | 官方故事目录与详情 |
| GET `/api/zhihu/search?q=...` | 登录后搜索知乎摘要 |
| POST `/api/jobs` | 建立模拟书或真实分析任务 |
| POST `/api/jobs/{id}/cancel`、`retry` | 取消与重试 |
| GET `/api/jobs/{id}/result` | 下载自己的成功任务产物 |
| POST `/api/imports` | 登记成功入架 |

业务写操作要求 `Origin` 等于 `APP_ORIGIN`；仅本地模拟授权表单使用 `API_ORIGIN`。CORS 只允许该前端来源及所需 Authorization/Content-Type 请求头，API 禁止缓存。真实应用会话不发送 Cookie；本地 mock 继续使用 HttpOnly Cookie。未登录、其他用户、过期和未成功的任务不能下载产物。真实会话验证可跨实例，但 SQLite 任务、记录和预算仍不共享，FC 部署边界见部署说明。

测试：`.venv\Scripts\python -m pytest backend -q`。覆盖授权关联/单次码/注销/来源校验、账号隔离、七天过滤、实际可下载产物、取消重试限制和重启恢复。`test_pages.py` 另覆盖真实流程的跨实例请求证明及应用会话、过期/篡改拒绝、精确 CORS 和令牌边界。测试使用虚构凭据并禁用 dotenv，不调用真实知乎接口。

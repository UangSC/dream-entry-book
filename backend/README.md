# 账号与织梦服务

运行命令见根目录 README。数据库默认 `backend/data/dreams.sqlite3`，任务产物位于 `backend/data/results/`，均不提交 Git。SQLite 使用 WAL；记录查询最多返回最近七天每类 100 项，启动时清理过期记录与产物。

## 模拟授权与任务

默认 `OAUTH_MODE=mock`。走完整 Authorization Code 流程：开始授权→本地同意页→一次性授权码→服务端回调兑换→HttpOnly 会话 Cookie。`state` 与发起浏览器绑定，授权码单次、短期有效；同名模拟昵称对应同一模拟身份。

后台队列按五阶段推进，支持取消、重试、三个活动任务上限、进程重启续跑。模拟结果复制正式小妖怪书包并设置独立 ID 和 `simulation` 标记，不分析或改写提交的小说。浏览器下载结果后仍执行原有 `.dreambook` 严格校验，成功才入架。可用 `MOCK_STAGE_SECONDS` 调整阶段耗时，默认 2 秒。

会话和平台 Token 只存服务端内存，重启需要重新登录；游玩、任务、入架记录保留。当前为单进程队列，请使用一个 Uvicorn worker。书签正文和恢复状态仍在浏览器，后端游玩记录是章节/终幕足迹，不提供跨设备续读。

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

密钥仅通过环境变量传入，不写入前端或仓库。实际替换示例值后启动。回调地址配置为 `${APP_ORIGIN}/api/auth/callback`。已适配 `https://openapi.zhihu.com/authorize` 和 `https://openapi.zhihu.com/access_token`，授权回调兼容 `authorization_code`/`code`；用户资料调用使用 Access Secret、OAuth Token、请求时间戳组合。

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
| POST `/api/jobs` | 建立任务 |
| POST `/api/jobs/{id}/cancel`、`retry` | 取消与重试 |
| GET `/api/jobs/{id}/result` | 下载自己的成功任务产物 |
| POST `/api/imports` | 登记成功入架 |

写操作要求 `Origin` 等于 `APP_ORIGIN`，所有 API 禁止缓存；HTTPS 部署 Cookie 自动启用 Secure。未登录、其他用户、过期和未成功的任务不能下载产物。

测试：`.venv\Scripts\python -m pytest backend/test_app.py -q`。覆盖授权关联/单次码/注销/来源校验、账号隔离、七天过滤、实际可下载产物、取消重试限制和重启恢复。

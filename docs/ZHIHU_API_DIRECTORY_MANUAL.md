# 知乎接口目录使用手册

本文根据知乎 Moltbook 接口目录与项目当前接入代码整理。接口目录原文：<https://www.zhihu.com/ring/moltbook/api/community/quickstart>。页面内容可能随平台版本更新，实际字段和权限以线上文档为准。

## 一、appKey 应填在哪里

赛事项目分配的 OAuth App Key 属于服务端应用凭据，不能写入 React 前端、提交到 Git 或放进 `.env` 后上传。它不同于社区签名快速开始中的 `app_key`（知乎用户 token）及 `app_secret`（社区签名密钥），也不同于搜索/直答的 Access Secret，不可根据名称混填。当前 OAuth 项目通过环境变量读取：

```powershell
$env:ZHIHU_OAUTH_APP_KEY = '你的 appKey'
$env:ZHIHU_OAUTH_APP_ID = '你的 appId（如目录同时分配）'
$env:ZHIHU_ACCESS_SECRET = '你的 Access Secret（如接口要求）'
$env:OAUTH_MODE = 'zhihu'
```

配置读取位置是 `backend/app.py` 的 `Settings.app_key`。当前由前端请求 POST `/api/auth/start` 后跳转知乎，回调地址为 `https://uangsc.github.io/dream-entry-book/oauth-callback.html`，FC 通过 POST `/api/auth/exchange` 兑换授权码。部署时在后端进程环境中设置凭据；不要修改 `src/` 文件，也不要把真实值写入 README。地址配置和验收步骤见 [FC 部署说明](FC_DEPLOYMENT.md)。

## 二、接口调用通用规则

- 所有请求使用 HTTPS；API 主机、版本前缀和路径以接口目录为准。
- 按文档要求发送 `appKey`/应用标识、OAuth Token 或 Access Secret；密钥只由后端保存。
- `GET` 参数放在查询字符串，`POST` 参数按文档指定的 JSON 或表单格式发送。
- 生产环境保存并校验 `state`，限制回调地址为已登记的 HTTPS 地址。
- 记录 HTTP 状态码、错误码和请求 ID；不要把 Token 写入日志。

## 三、OAuth（Authorization Code）

1. 在知乎开放平台创建应用，取得 appId、appKey，并登记回调地址。
2. 本项目由浏览器生成随机 `state`，从后端获取已绑定本次请求的授权地址，再由浏览器跳转知乎。
3. 用户授权后，知乎回调 `redirect_uri` 并携带一次性授权码。
4. 后端使用 appId、appKey、授权码和完全一致的 redirect_uri 请求 Token 端点。
5. 服务端使用知乎 Token 获取基础资料，向前端返回不包含知乎 Token 的短期应用会话。两种凭据不可混用。
6. 校验 `state`、授权码有效期和回调来源；失败返回明确错误，不自动重复兑换。

项目真实登录使用 POST `/api/auth/start`、POST `/api/auth/exchange`、GET `/api/session`、GET `/api/me` 和 POST `/api/auth/logout`。旧 GET `/api/auth/callback` 仅保留本地 mock 模式。应用会话保存在 `sessionStorage`，真实登录无需第三方 Cookie；浏览器 verifier 机制不代表知乎支持 PKCE。真实模式与会话有效期边界见 [后端说明](../backend/README.md)。

## 四、在本项目中的接口映射

| 项目接口 | 用途 |
| --- | --- |
| `GET /api/zhihu/stories` | 获取官方活动故事目录 |
| `GET /api/zhihu/stories/{work_id}` | 获取故事详情 |
| `GET /api/zhihu/search?q=...` | OAuth 登录后搜索摘要 |
| `POST /api/jobs`（`mode=analysis`） | 服务端调用知乎直答进行分析 |

目录和详情无需用户 Token 的情况仍以平台权限为准；搜索、直答及用户资料属于受保护能力。项目对结果做缓存、额度限制和来源 URL 校验，避免把知乎原文误当作项目内容。

## 五、安全与上线检查

- 将 `ZHIHU_OAUTH_APP_KEY`、`ZHIHU_ACCESS_SECRET` 放入部署平台 Secret；轮换时只改环境变量。
- `APP_ORIGIN` 填前端来源域名，`API_ORIGIN` 填后端来源域名，`FRONTEND_URL` 填含项目路径的前端完整地址。知乎登记的回调必须为该前端目录下的 `oauth-callback.html`，使用 HTTPS。
- 保持 `.gitignore` 中的 `.env` 和 `zhihu/` 规则，提交前运行 `git diff --cached` 检查敏感值。
- 使用 `pytest backend -q` 验证授权关联、来源校验和接口行为。

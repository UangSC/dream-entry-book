# 知乎 OAuth 应用集成

资料复核时间：2026-09-14
当前官方依据：https://developer.zhihu.com/docs?key=zhihu_oauth_integrated
适用对象：需要在 Web 应用中集成知乎登录，并代表已授权知乎用户访问数据的开发者

OAuth 是开发者集成能力，不是 `zhihu-cli` 的普通用户鉴权方式。CLI 使用 Access Secret 查询该凭证所属账号自己的数据，不发起 OAuth、不接收用户 OAuth token。

## 目录

- [凭证与角色](#凭证与角色)
- [前置申请](#前置申请)
- [Authorization Code Flow](#authorization-code-flow)
- [授权页面](#授权页面)
- [换取 Access Token](#换取-access-token)
- [调用用户数据 API](#调用用户数据-api)
- [安全要求](#安全要求)
- [协议待确认项](#协议待确认项)

## 凭证与角色

| 凭证 | 代表谁 | 用在哪里 |
|---|---|---|
| `app_id` | 第三方应用 | 发起授权、换取 token |
| `app_key` | 第三方应用密钥 | 仅应用后端换取 token |
| `authorization_code` | 用户一次授权结果 | 应用后端换取 access token |
| OAuth `access_token` | 已授权知乎用户 | 用户数据 API 的 `X-OAuth-Token` |
| 开放平台 Access Secret | 开放平台调用方 | 用户数据 API 的 `Authorization: Bearer ...` |

代表其他用户调用用户数据 API 时，需要同时提供最后两项：Access Secret 鉴权调用方，OAuth access token 指明当前被代表的用户。

## 前置申请

向 `openplatform@zhihu.com` 申请 `app_id` 和 `app_key`。此前记录的 `product-platform@zhihu.com` 已不符合当前官方说明。

邮件主题：

```text
<公司/组织/产品名称>申请接入知乎 OAuth 服务
```

申请材料：

- 应用名称
- 应用简介
- 应用图标（分辨率至少 256×256，以附件发送）
- OAuth 授权完成后的回调地址 `redirect_uri`
- 申请人姓名
- 申请人手机号
- 申请人知乎个人中心地址
- 申请获取的用户权限：A. 邮箱、B. 手机、C. 公开内容（个人创作、关注用户列表、公开收藏夹），按实际用途选择

权限会在授权时向用户展示并再次确认。赛事专属应用凭据是否已分配，应在赛事项目页面核对；Access Secret 不能替代 App ID 或 App Key。

## Authorization Code Flow

1. Web 应用将用户跳转到知乎授权页面。
2. 用户登录知乎并确认授权。
3. 知乎重定向回已登记的 `redirect_uri`，附带授权码。
4. 应用后端用授权码、`app_id` 和 `app_key` 换取 access token。
5. 应用后端将 access token 作为 `X-OAuth-Token` 调用知乎用户数据 API。

## 授权页面

```text
GET https://openapi.zhihu.com/authorize?redirect_uri={redirect_uri}&app_id={app_id}&response_type=code
```

当前官方文档给出的回调形态：

```text
{redirect_uri}?authorization_code={authorization_code}
```

回调参数为 `authorization_code`。应用后端把它的值作为 token 接口的 `code` 表单参数提交，即 `code = callback.authorization_code`。本项目同时兼容读取 `code`，官方主路径仍为 `authorization_code`。

`redirect_uri` 应进行 URL 编码，并且必须与申请时登记的地址一致。当前官方文档没有说明 `state` 回传、PKCE、scope 请求参数和用户拒绝授权时的回调参数。示例没有 `state` 不等于已证实平台不支持它；需实际联调或由平台确认。

## 换取 Access Token

```text
POST https://openapi.zhihu.com/access_token
Content-Type: application/x-www-form-urlencoded
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `app_id` | String | 是 | 第三方应用 ID |
| `app_key` | String | 是 | 第三方应用密钥 |
| `grant_type` | String | 是 | 固定为 `authorization_code` |
| `redirect_uri` | String | 是 | 申请应用时登记的回调地址 |
| `code` | String | 是 | 用户授权后获得的 authorization code |

### cURL

```bash
curl -sS -X POST 'https://openapi.zhihu.com/access_token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "app_id=${APP_ID}" \
  --data-urlencode "app_key=${APP_KEY}" \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode "redirect_uri=${REDIRECT_URI}" \
  --data-urlencode "code=${CODE}"
```

### 成功响应

```json
{
  "access_token": "xxx",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `access_token` | String | 用户 OAuth 访问令牌 |
| `token_type` | String | 令牌类型，如 `Bearer` |
| `expires_in` | Int64 | 有效期，单位为秒 |

## 调用用户数据 API

应用后端用开放平台 Access Secret 和用户 OAuth token 共同调用：

```bash
curl -G 'https://developer.zhihu.com/api/v1/user/contents' \
  -d 'ContentType=all' \
  -H 'Authorization: Bearer <access_secret>' \
  -H 'X-OAuth-Token: <oauth_access_token>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

完整接口见 [用户数据 API](user-api.md)。

## 安全要求

- `app_key`、authorization code 的交换和 OAuth access token 的使用都在应用后端完成。
- 不把 `app_key` 或 OAuth access token 放进浏览器、移动端包、URL、前端日志或 Agent 输出。
- 回调必须校验请求关联性。本项目当前使用浏览器 Cookie 加随机 `state`；联调需验证回传。不应仅删除 `state` 检查；如平台采用其他机制，需要确认其对授权码与发起会话的绑定保障后再调整。
- OAuth access token 与开放平台 Access Secret 分开存储、分开审计、分开撤销。
- 用户取消授权、token 过期或接口返回鉴权失败时，停止访问，不静默切换到 Access Secret 所属账号。

## 协议待确认项

1. 当前官方说明未定义 `state` 回传。本项目要求原值回传，缺失将拒绝登录；当前没有本项目真实 OAuth 联调结果。
2. 文档没有 PKCE、scope、用户拒绝授权、错误响应和回调错误参数。
3. 只返回 `access_token` 与 `expires_in`，没有 refresh token；需确认过期后是否必须重新授权。
4. 没有 token 撤销、授权查询或解绑接口。
5. 文档提到“获取用户信息”，但没有提供对应 endpoint 和响应 schema。
6. `app_key` 作为 HTTPS 表单字段已由当前官方 cURL 示例明确，不再作为待确认项；不自行增加文档未规定的签名协议。

## 旧资料中的跨项目实测记录（本轮未复验）

下列内容来自旧资料对知乎 2077 项目的描述，不是本项目或当前平台版本的已验证事实：

- 授权回调使用 `authorization_code`，不是旧文档中的 `code`。
- token 交换接口的表单字段仍使用 `code`。
- 授权回调没有带回请求中的 `state`。
- `/access_token` 和 `/user` 响应中的业务字段 `code: 20000` 表示成功；客户端应优先检查 `access_token` 或用户对象是否存在，不把 `20000` 当错误。

实现证据：`../zhihu2077/src/routes/auth.js`；项目记录：`../zhihu2077/CLAUDE.md`、`../zhihu2077/specs/ARCHITECTURE.md`。

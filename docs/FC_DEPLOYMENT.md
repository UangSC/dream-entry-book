# 阿里云 FC：代码包与依赖层部署

本说明对应 `cn-hangzhou` 的 Web 函数 `rumengshu`，运行环境为自定义运行时 Debian 11 / Python 3.12，CPU 架构为 x86_64。不要上传旧的 Python 3.11 依赖包，也不要把 Windows `.venv` 打包上传。

依据：[阿里云官方：使用 WebIDE 打包函数第三方依赖](https://help.aliyun.com/zh/functioncompute/use-webide-to-package-third-party-dependencies-of-a-function-1)。官方建议将第三方依赖安装到 `python/` 并发布为层；挂载后位于 `/opt/python`。

## 生成上传包

仅更新业务代码、复用现有层时运行：

```powershell
.venv\Scripts\python tools/package-fc.py --code-only
```

2026-09-14 本轮生成的新代码包为 `.work/fc-py312-m2al4pal/rumengshu-fc-code.zip`（16,526 字节），只含六个白名单后端文件，不含 `.env`、本地数据或素材。新增浏览器授权模块，复用此前的 Linux Python 3.12 依赖层与素材层。旧 `fc-py312-8vsccftd` 包不包含本轮前端回调方案，不要再用它更新。

验证代码包并复用旧层：

```bash
python3 tools/verify-fc-package.py /path/to/new-code-output --layers-dir /path/to/previous-layer-output
```

在项目根目录运行：

```powershell
.venv\Scripts\python tools/package-fc.py
```

命令输出一个新的 `.work/fc-py312-*/` 目录，不覆盖旧包。目录内有：

| 文件 | 上传位置 | 内容 |
| --- | --- | --- |
| `rumengshu-fc-code.zip` | 函数 → 代码 → 上传 ZIP | 明确列出的后端代码和运行依赖清单 |
| `rumengshu-fc-dependencies-py312-x86_64.zip` | 层 → 创建自定义层 | `python/` 下的 Linux Python 3.12 第三方依赖 |
| `rumengshu-fc-demo-assets.zip` | 层 → 创建自定义层 | `rumengshu/books/little-demon.dreambook`，模拟织梦任务所需资源 |
| `manifest.json` | 本地核对，无需上传 | ZIP 文件清单、大小、SHA-256、依赖版本 |
| `requirements-linux-py312.lock` | 本地留档，无需上传 | 本次解析到的精确依赖版本 |

脚本不会读取 `.env`，不复制本地数据库、用户任务结果、缓存、Git 历史或整个后端目录。pytest 仅用于开发，不进入运行依赖层。项目中的 `.work/` 已被 Git 忽略。

## 控制台操作顺序

已挂载依赖层与素材层的现有函数，本次只执行第 4、5 步。启动命令也可直接使用 `env PYTHONPATH=/opt/python:/code python3 -m uvicorn backend.fc:app --host 0.0.0.0 --port 9000`。

1. 在杭州地域打开“层”，创建 `rumengshu-python312`，上传依赖层 ZIP。兼容运行环境选择与函数实际环境匹配的自定义运行时 Debian 11；不要只选内置 Python 事件运行时。
2. 创建 `rumengshu-demo-assets`，上传素材层 ZIP，选择相同兼容运行环境。
3. 返回 `rumengshu` → 编辑层，添加上述两个层的最新版本。保留现有 Python 3.12 运行时层（如果环境使用该层），不要用新依赖层替换解释器层。
4. 在“代码”页用新的代码 ZIP **替换**旧包。确保旧 `/code/pydantic_core`、`/code/fastapi` 等依赖目录不再残留，否则 `/code` 里的旧版本会遮盖新层。
5. 配置以下启动命令、端口和环境变量，保存并部署新版本。

```bash
python3 -m uvicorn backend.fc:app --host 0.0.0.0 --port 9000
```

| 配置 | 值 |
| --- | --- |
| 监听端口 | `9000` |
| 执行超时 | `60` 秒（健康检查与短请求；并非后台分析时长保证） |
| `PYTHONPATH` | `/opt/python:/code` |
| `TZ` | `Asia/Shanghai` |
| `APP_ORIGIN` | `https://uangsc.github.io`，Origin 不包含路径 |
| `API_ORIGIN` | `https://rumengshu-igadxpnchf.cn-hangzhou.fcapp.run`，后端域名，不加 `/api` |
| `FRONTEND_URL` | `https://uangsc.github.io/dream-entry-book/`，登录后返回的完整前端地址 |
| `OAUTH_MODE` | `zhihu` |
| `ZHIHU_PROFILE_URL` | `https://openapi.zhihu.com/user` |

`ZHIHU_OAUTH_APP_ID` 和 `ZHIHU_OAUTH_APP_KEY` 由维护者直接在 FC 环境变量表单填写平台分配值。不要放在 GitHub 的 `VITE_*` 变量中，也不要发给开发助手。`APP_SESSION_SECRET` 可选：不填写时使用后端 APPKEY 派生独立用途的会话签名键；填写时请使用服务器专用随机秘密，各实例保持一致。仅登录和读取基础资料不要求 `ZHIHU_ACCESS_SECRET`，搜索和直答另需该凭据。

本地最新代码已区分以上三个地址；截至 2026-09-14 本轮修改尚未上传 FC。等项目改动完成后再统一打包更新，不能把本地配置说明视为线上已生效。

GitHub 仓库 Settings → Secrets and variables → Actions → Variables 设置公开变量 `VITE_API_BASE_URL` 为上述 `API_ORIGIN`。Pages 工作流在构建时读取它；修改变量后需要重新运行部署工作流或推送触发构建。该值不能带 `/api`、密钥或查询参数。

当前工作流在该变量未填写时，默认使用上表的 `rumengshu` FC 公网地址；更换后端域名时设置此变量即可覆盖。这个默认地址是公开配置，不包含密钥。

知乎平台登记的回调改为 **`https://uangsc.github.io/dream-entry-book/oauth-callback.html`**，必须与上述 `FRONTEND_URL` 下的独立页面完全一致。作品链接仍为 `https://uangsc.github.io/dream-entry-book/`。不要再登记 FC 的 `/api/auth/callback`，也不要用首页代替回调页。

旧流程在默认 `fcapp.run` 域名执行站外 3xx 时收到 `ExternalRedirectForbidden`。本轮改为：浏览器 POST `/api/auth/start` 获取 JSON 授权地址 → 浏览器跳到知乎 → 知乎回到 Pages 回调页 → 回调页 POST `/api/auth/exchange` → 浏览器返回作品首页。FC 不再执行站外跳转；真实模式下旧 GET 授权入口返回 409 指引。

这解决应用使用 FC 站外重定向的问题，不改变[阿里云默认公网域名仅供测试的限制](https://help.aliyun.com/document_detail/2868393.html)。正式生产应另行配置自定义域名或网关。

其他知乎配置继续由维护者在控制台填写，不打印或导出环境变量值。FC 入口会禁止 dotenv 文件加载，只从进程环境获取配置。本地 `backend.app:app` 入口仍可由程序读取 `.env`。

FC 入口默认把临时数据库与任务结果放在 `/tmp/rumengshu`，把模拟书包读取路径设为 `/opt/rumengshu/books/little-demon.dreambook`。可分别用 `RUMENGSHU_DATA_DIR` 和 `RUMENGSHU_DEMO_BOOK` 覆盖，但不要误把临时存储当成持久化存储。

## 验证

代码包在本机 WSL Linux x86_64 / Python 3.12 环境中解压验证，检查二进制扩展加载、健康接口、未登录保护、模拟登录、示例书包层生成任务与下载及 Uvicorn 实际 HTTP 启动。真实 OAuth 的模拟上游测试另覆盖跨 FC 实例兑换和会话验证、错误或过期授权请求、CORS、无第三方 Cookie 及知乎令牌不返回前端。以上不代表真实知乎登录已通过；本轮前后端尚未部署。

可以在相同 Linux 环境复验指定构建目录：

```bash
python3 tools/verify-fc-package.py /path/to/fc-py312-output
```

验证程序使用新解压的代码、临时数据库和空凭据，不加载项目 `.env`，不调用真实知乎接口。

访问 `https://rumengshu-igadxpnchf.cn-hangzhou.fcapp.run/api/health`，预期 HTTP 200 和 `status: ok`。仅健康检查通过不等于知乎授权成功或前后端已经联通。

### 部署后的手动登录验收

1. 更新 FC 代码 ZIP，保留已挂载的层、启动命令及上述配置；健康接口应返回 200。
2. 发布新版 Pages 前端，核对 Actions 的公开变量 `VITE_API_BASE_URL`。只更新 FC 不能启用新流程。访问独立回调页应看到“请从作品页面重新登录”，而非 404 或阅读首页。
3. 在知乎赛事平台保存上面的 Pages 回调地址。浏览器先打开作品首页；若显示“新版本已备好”，更新书页并刷新，避免旧离线缓存继续使用旧授权代码。
4. 点击“知乎登录”，本人在知乎完成授权。预期自动回到作品首页并显示本人头像/昵称；刷新当前标签页后仍有登录状态。不要复制或分享回调中的授权码、开发者工具的 Authorization 请求头。
5. 点击退出，预期恢复“知乎登录”；重新登录可正常完成。取消知乎授权应展示可返回作品的提示，无无限重试。应用会话最长一小时，过期后重新登录。

通过标准：健康接口 200、新前端正常加载、一次真实授权返回正确账号、刷新保留会话、退出恢复未登录。作品阅读和本地书签可独立检查，不以它们能使用作为 OAuth 通过依据。

如果仍报 `_pydantic_core` 缺失，检查实际解释器是否为 Python 3.12、架构是否 x86_64、依赖层是否已挂载、`PYTHONPATH` 是否生效，以及旧代码包依赖是否残留。ARM64 函数不能使用本包。

## 本次打包的边界

真实登录使用可跨实例验证的短期签名应用会话，保存于当前标签页的 `sessionStorage`，通过 Authorization 请求头访问 FC，不依赖第三方 Cookie。知乎 APPKEY 和 OAuth Token 不返回前端。授权请求额外使用随机 state、浏览器 verifier 和后端签名 transaction 绑定；这是本项目的浏览器请求证明，**不表示知乎支持 OAuth PKCE**。授权码单次兑换仍依赖知乎上游。

退出会删除当前浏览器的应用会话。当前没有共享服务端撤销名单，已被复制的签名凭据到期前仍有效；轮换实际用于签名的服务器秘密可令旧会话失效。不要把这个应用凭据称为知乎 OAuth Token。

业务部分仍依赖 SQLite 和单进程后台队列，尚未完成共享持久化迁移：临时数据随 FC 实例回收丢失，不同实例不共享任务或预算，后台任务不能依靠请求结束后的 CPU 持续运行。跨实例登录测试通过不等于业务任务已适配 FC 生命周期。本地 mock 模式仍使用内存会话与 Cookie；书签正文和回退队列一直保存在浏览器。

后续修改业务代码只更新代码 ZIP；第三方依赖发生变化才发布依赖层新版本；示例书包变化才发布素材层新版本，并更新函数引用的层版本。

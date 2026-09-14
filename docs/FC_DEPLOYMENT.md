# 阿里云 FC：代码包与依赖层部署

本说明对应 `cn-hangzhou` 的 Web 函数 `rumengshu`，运行环境为自定义运行时 Debian 11 / Python 3.12，CPU 架构为 x86_64。不要上传旧的 Python 3.11 依赖包，也不要把 Windows `.venv` 打包上传。

依据：[阿里云官方：使用 WebIDE 打包函数第三方依赖](https://help.aliyun.com/zh/functioncompute/use-webide-to-package-third-party-dependencies-of-a-function-1)。官方建议将第三方依赖安装到 `python/` 并发布为层；挂载后位于 `/opt/python`。

## 生成上传包

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

其他知乎配置继续由维护者在控制台填写，不打印或导出环境变量值。FC 入口会禁止 dotenv 文件加载，只从进程环境获取配置。本地 `backend.app:app` 入口仍可由程序读取 `.env`。

FC 入口默认把临时数据库与任务结果放在 `/tmp/rumengshu`，把模拟书包读取路径设为 `/opt/rumengshu/books/little-demon.dreambook`。可分别用 `RUMENGSHU_DATA_DIR` 和 `RUMENGSHU_DEMO_BOOK` 覆盖，但不要误把临时存储当成持久化存储。

## 验证

本次交付 ZIP 已在本机 WSL Linux x86_64 / Python 3.12.3 中解压验证：二进制扩展加载、健康接口、未登录保护、模拟登录、示例书包层生成任务与下载、Uvicorn 实际 HTTP 启动全部通过。未在阿里云上上传部署，也未用真实知乎凭据进行登录验证。

可以在相同 Linux 环境复验指定构建目录：

```bash
python3 tools/verify-fc-package.py /path/to/fc-py312-output
```

验证程序使用新解压的代码、临时数据库和空凭据，不加载项目 `.env`，不调用真实知乎接口。

访问 `https://rumengshu-igadxpnchf.cn-hangzhou.fcapp.run/api/health`，预期 HTTP 200 和 `status: ok`。仅健康检查通过不等于知乎授权成功或前后端已经联通。

如果仍报 `_pydantic_core` 缺失，检查实际解释器是否为 Python 3.12、架构是否 x86_64、依赖层是否已挂载、`PYTHONPATH` 是否生效，以及旧代码包依赖是否残留。ARM64 函数不能使用本包。

## 本次打包的边界

这次修复部署依赖和代码包体积，没有完成之前计划的无状态后端重构：当前业务代码仍依赖 SQLite 和内存会话，临时数据会随实例回收丢失，不同实例不共享登录状态、任务或预算。后台任务也不能依靠请求结束后的 CPU 持续运行。素材层保留了原有模拟任务所需文件，不表示任务已适配 FC 生命周期。

GitHub Pages 的跨站会话、前端 API 地址、OAuth 回调和返回地址仍需单独适配与联调。不要把 `APP_ORIGIN` 直接当作完整 Pages 返回 URL；也不要将密钥放入 `VITE_*` 变量或静态网页。

后续修改业务代码只更新代码 ZIP；第三方依赖发生变化才发布依赖层新版本；示例书包变化才发布素材层新版本，并更新函数引用的层版本。

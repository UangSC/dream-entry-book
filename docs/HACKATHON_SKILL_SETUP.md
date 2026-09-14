# 知乎 Hackathon Skill：本地接入记录

安装日期：2026-09-14。适用于已有的“入梦书”项目；本轮不推送 GitHub，不上传 FC，不部署静态资源。

## 作用

`zhihu-hackathon` 是供 AI 开发助手使用的初始化与接入流程，包含基础版/OAuth 版 Hello World 模板、回调配置脚本、检查脚本和官方 `zhihu` Skill 快照。它帮助开发者接入知乎能力，本身不是网站功能，也不提供服务器或免费的接口额度。

官方 `zhihu` Skill 提供 API 参考资料及 CLI 操作规则，支持知乎搜索、全网搜索、热榜、直答，以及当前 Access Secret 所属账号的创作、关注、收藏。CLI 的本人查询与网站用户的 OAuth 登录是两条不同的授权流程；CLI 验证成功不代表网站登录已经完成。

## 已安装与验收

| 项目 | 结果 |
| --- | --- |
| 下载来源 | `https://zhstatic.zhihu.com/skill/zhihu-hackathon-skill_v2026s2.zip` |
| 下载包 SHA-256 | `d7517cad343fe5eb6bd911c4fa3edc7b21dd665d43caad4e73438c1ef849f112` |
| 编排 Skill | 用户级 `C:/Users/UangSC/.codex/skills/zhihu-hackathon` |
| 官方 Skill | 项目级 `.codex/skills/zhihu`，随包版本 `0.2.1` |
| 官方内嵌 ZIP 校验 | 与随包声明的 SHA-256 一致：`be08e10bbd8f7c554456599e1bdf9e4a4f9216a7624d0b29218e9e4dc1c2f9f3` |
| CLI | 复用已安装的 `0.6.0-beta.20260908125143`，符合最低版本要求 |
| CLI 路径 | `C:/Users/UangSC/AppData/Local/ZhihuCLI/current/zhihu-cli.exe` |
| 凭据验证 | `auth status --verify` 退出码 0，来源为系统凭据库 |
| 最小业务检查 | `me contents --type all --limit 1` 退出码 0，业务 `Code=0` |

下载包先检查了解压路径和符号链接；安装未覆盖已有 Skill。没有读取项目 `.env`，没有记录密钥或本人内容正文。上述两项在线检查会请求知乎接口；后续日常使用不重复初始化。

Skill 原件和下载缓存已被现有 Git 忽略规则排除，不加入 Pages 构建或 FC 代码包。

## 现有项目与模板的区别

原始 `init_project.mjs` 要求目标目录为空，会复制新的 Node.js Hello World 项目；它不是给既有 Vite/Python 项目原地迁移的脚本。因此本次完成项目级 Skill 安装和 CLI 初始化，没有运行模板生成器、覆盖 `package.json`，也没有生成不被当前应用读取的 `hackathon.config.json`。

原编排脚本依赖 `/bin/bash`、`/usr/bin/unzip` 和 macOS 钥匙串。Windows 项目使用官方 Skill 自带的 PowerShell 入口；App Key 继续由现有后端/FC 配置管理。不能用示例模板替换当前应用的回调和部署入口。

## 文档版本差异

远端状态检查报告官方 Skill 最新版为 `0.7.2-beta.20260911131715`，本次按用户指定下载包保留 `0.2.1` 快照，没有改写或自动升级官方文件。

编排包中“回调可能不返回 state”和“/user 没有正式 schema”的描述属于旧资料。此前核对的新版黑客松参考文档明确支持 `state` 透传，并说明 `GET https://openapi.zhihu.com/user` 使用 OAuth Token 的 Bearer 鉴权，返回 `uid/hash_id/fullname/avatar_path` 等字段。不得据旧模板删除当前应用的 `state` 校验。

当前已有的 GitHub Pages + 阿里云 FC 方案继续沿用。本地已改为前端跳转及 Pages 独立回调，真实应用会话无需第三方 Cookie，并可跨 FC 实例验证。真实 OAuth 联调仍需更新前后端、登记新回调，并由用户本人完成知乎授权；短期会话退出边界与临时任务存储限制见 [FC 部署说明](FC_DEPLOYMENT.md)。这些是对现有项目的适配，不是直接运行旧版 Skill 模板的结果。

## 日常调用

在后续对话中可以要求“用知乎 Skill 搜索某个话题”或“按官方文档核对接口”。新安装的 Skill 在下一轮对话可被发现。

手动检查工具状态：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .codex/skills/zhihu/scripts/run.ps1 status
```

凭据通过系统凭据库或部署平台私密配置传入。不要把密钥发到对话中，也不要写入命令参数、项目文档、前端 `VITE_*` 配置或 Git。

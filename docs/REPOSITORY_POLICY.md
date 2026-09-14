# 仓库与 Pages 发布规则

Git 保留可构建的应用源码、必要剧情输入、测试、运行素材、许可说明和本目录登记的使用文档。开发计划与个人机器资料在本地保存，不参与发布。

## 本地保留，不进入 Git

- `.env` 及其环境变体、密钥文件、数据库、账号或任务结果、日志。
- `DELIVERY.md`、`AGENTS.md`、`SKILL.md`、开发计划、验收记录、提示词、申报草稿与工具安装记录。
- `zhihu/` 官方参考资料、`.work/`、原始音画素材、备用素材和转码中间结果。
- 根目录临时海报、图标、ZIP 上传包；需要正式发布的素材应加工后登记到资源清单。

`docs/` 默认忽略，仅允许 [文档目录](README.md) 及其列出的公开指南。新开发笔记直接放在 `docs/local/` 或 `.work/`；本地旧文档可继续编辑，Git 不再跟踪。

正文编译所需的四份 `content/final/02–05` Markdown 是作品内容，必须保留。`content/drafts/little-demon-legacy.json` 提供构建基础数据；唯一保留的故事节选 JSON 用于来源哈希测试。其余草稿和候选故事不提交。报告由构建与测试自动生成到 `.work/story/`，不依赖本地旧审读报告。

## 提交前检查

先按明确文件暂存，再运行：

新克隆先运行 `npm ci` 与 `npm run setup:hooks`，启用提交前检查。此工作区已启用；检查失败会阻止创建提交。Git 钩子不会随克隆自动启用，因此 CI 仍会独立复查。

```sh
git status --short
npm run check:repository
```

检查读取 **Git 暂存区**，在读取内容前跳过全部 dotenv 文件；不扫描个人 `.env`。即使用 `git add -f`，禁止文件也会被检查拦截。检查会识别常见个人绝对路径、编辑器私有链接、部分已知密钥格式、断开的文档链接和未登记素材；它不是所有秘密格式的识别保证。

代码示例使用项目相对路径。部署中的 `/code`、`/opt/python`、`/tmp/rumengshu` 是服务器运行约定，可写入公开说明；不要写个人机器的用户目录或工作区绝对地址。不要把凭据交给助手或粘贴进文档。

## Pages 发布范围

`tools/public-assets.mjs` 定义固定应用资源，并从 `public/art`、`public/audio`、`public/mascot` 的清单读取运行素材。新增素材要登记清单、更新哈希并加入 Git；只把文件放进 `public/` 不会自动发布。

Vite 构建关闭整个 public 目录复制，只复制登记的资源，即使本地仍保留未跟踪的 PNG/WAV，也不会混入 `dist/`。旧书包是导入兼容样例，不要作为临时文件删除。素材清单保留作者、名称和使用依据，移除制作机路径与备用文件记录。

CI 在构建前检查仓库，构建后检查 `dist/`，全部通过才上传 Pages 产物。完整检查：

```sh
npm run test:repository
npm run check:repository
npm run build
npm run check:repository -- --dist
npm run test:offline
```

清理文件时使用 `git rm --cached`，保留本地原件。正常提交只能从最新分支移除文件，旧提交、标签和已有克隆仍可能保存历史内容；历史重写需单独协调，不能通过普通清理假称历史已经消失。

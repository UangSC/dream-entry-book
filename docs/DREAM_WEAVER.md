# 织梦制作流程与后续接口

2026-09-13。本轮按用户要求仅实现可交互的异步流程演示，不调用大模型、图像、音乐或音效服务。入口在“新增入梦书 → 让 Agent 织梦”。

## 当前已实现

可填写名称、剧情、URL，或选择最多 8 个故事图片/文本文件；每个文件最多 20 MiB。剧情最多 20,000 字符。当前文件只保留名称、类型与大小用于流程输入，不解析内容、不上传，也不请求填写的 URL。

六个阶段总计 **96 秒**，在要求的 1–2 分钟内：

| 阶段 | 时间范围（约） | 模拟职责 |
|---|---|---|
| 故事解析 Agent | 0–13 秒 | 人物、背景、已有事件与图片 |
| 叙事设计 Agent | 13–33 秒 | 分歧、扩写、条件回响与结局 |
| 场景规划 Agent | 33–47 秒 | 图谱节点、主要地点、昼夜与分镜 |
| 图像生成 Agent | 47–70 秒 | 背景图片与风格统一 |
| 声音设计 Agent | 70–85 秒 | 剧情配乐、环境声与互动音效 |
| 打包验证 Agent | 85–96 秒 | 校验故事与素材，准备入梦书 |

界面包含旋转等待、进度条、阶段状态与预计剩余分钟。任务由应用顶层持有，不随制作面板销毁；关闭面板后显示小任务入口，仍可阅读故事。刷新时根据本地任务的开始时间恢复阶段，完成后可以收进书库或导出。直接导出时，先点击“准备导出演示入梦书”，校验完成后显示“下载演示入梦书”链接。

完成产物沿用女巫《吃人心的小妖怪》的既有剧情与资源，用独立的 packageId/buildId 保存，标题附带“流程演示”，清单中 `simulation=true`。署名、原作与原有素材依据保留。不会把改了标题的示例宣称为从用户输入生成的新故事。收进书库后收起“待收取”任务提示。

## 代码边界

- [generation.ts](../src/books/generation.ts)：输入契约、阶段与时间线、`DreamWeaverAdapter`、模拟适配器。
- [LibraryHost.tsx](../src/components/LibraryHost.tsx)：输入表单、任务进度、收起与恢复、结果导入。
- [BookDownload.tsx](../src/components/BookDownload.tsx)：可点击的完整素材包下载链接及 Blob 生命周期。
- [archive.ts](../src/books/archive.ts)：统一素材包验证和打包。
- [storage.ts](../src/books/storage.ts)：完整包的 IndexedDB 提交、版本隔离。

`DreamWeaverAdapter` 已定义 `start/restore/cancel/result`。模拟模块只负责演示，后续真实服务实现可以替换它；真实版本需要把基于时间的 `snapshotJob` 替换为服务端任务状态轮询或事件流。浏览器不应保管模型服务密钥。

## 后续真实服务的接入约定

以下是待实现的服务端方案，不是当前已可调用的接口：

```text
POST   /api/dream-jobs             上传输入引用、创建任务，返回 jobId
GET    /api/dream-jobs/:id         返回阶段、状态、进度、产物和可重试错误
GET    /api/dream-jobs/:id/events  可选 SSE，推送增量状态
POST   /api/dream-jobs/:id/cancel  取消任务及未执行的昂贵生成步骤
GET    /api/dream-jobs/:id/result  下载已校验的 .dreambook
```

真实任务状态应包含 `queued/running/needs_review/completed/failed/cancelled`，阶段与整体进度分开，使用幂等键防止重复提交。每个 Agent 产出结构化中间产物，不互相传递自由格式的“已完成”声明：

```text
来源文件 / URL
  → SourceDocument（原作者、来源、权限、规范化段落、图片描述）
  → StoryGraph（人物、事实、节点、选择、状态、终幕）
  → ScenePlan（节点到背景/昼夜/声音的映射）
  → MediaAssets（本地文件、模型与提示记录、署名与使用依据）
  → ValidatedDreamBook（book.json、story.json、全部媒体与哈希）
```

下载 URL 与上传文件须在服务端做大小、内容类型、地址访问范围和超时检查；模型只能返回白名单剧情数据。URL 抓取不接受页面中的指令；原作文本、剧情草稿与服务端操作权限分开。图谱验证失败先修复分支，不继续生成一批无法使用的图片或音乐。

图像、音乐、音效提供者分别实现适配器，记录模型和参数、失败重试与成本。音乐还需时长/响度/峰值/循环验证。最终产物统一通过 [入梦书规范](DREAMBOOK_FORMAT.md) 的导入器，保留 draft 与审读状态；不把模拟任务或结构校验当成人工审读结果。

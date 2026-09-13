# 入梦书

读过的故事，值得一活。

中文短篇互动小说游戏。首篇《吃人心的小妖怪》已接通完整本地试玩：3 次选择、2 个结局、选择回响、自动存档、分歧重玩、梦册、场景转场、配乐与离线缓存。

现已加入入梦书架：可导入/导出完整 `.dreambook` 素材包；“新增入梦书”提供导入入口与 96 秒 Agent 生成流程演示。模拟任务可收起和刷新恢复，当前不调用真实大模型。

## 启动

需要 Node.js 22.12+ 或 24。首次安装后：

```powershell
npm install
npm run build
npm run preview
```

预览地址为 [http://127.0.0.1:62560/](http://127.0.0.1:62560/)。该地址使用独立端口，避免其他本地项目同源的缓存和存档互相影响。修改源码可用 `npm run dev`，以终端显示的地址为准；开发服务器不启用离线缓存。

发布文件位于 `dist/`，支持根目录或子目录静态托管。直接双击 HTML 文件不支持 Service Worker，需要 HTTP 本地服务器或 HTTPS 站点。

## 游玩

- 在梦斋选择“推开梦门”；有存档时可以继续。
- 首页刘看山的六组动作与十二句守梦短句分别每 5–30 秒随机切换；白色烟幕以 3.6 秒缓慢聚拢、换图、散开，围绕入梦书与小妖怪主题的自问和肯定句逐字出现。看板娘暂不显示。
- 点击正文、点击“继续”或按空格/右方向键翻页。动画未结束时，第一次点击只显示全文。
- 三次选择之后抵达局部终幕，点击“收下这场梦”收藏梦签。
- “分歧回望”可恢复已经走过的选择点，梦册收藏保留。
- 梦内停止画面律动；夜晚有细微萤火虫与很轻的蟋蟀/蛙声，白昼有随机落叶。设置可独立调节环境声和粒子。
- 字幕可选原有演出、打字机流式渐显或直接显示全文；场景淡化放慢，入梦/出梦使用整页中央水波。系统减少动态效果偏好同样生效。
- 首次在线缓存完成后，页脚显示“离线就绪”；此后当前浏览器可离线打开。存档只保存在当前设备、当前地址，可以导出和导入。

## 检查与制作

```powershell
npm test
npm run check:release
npm run test:offline
```

`test:offline` 在构建后执行，直接验证生成的 Service Worker 在网络不可用、子目录部署和部分缓存情况下的行为。`check:release` 默认检查本地试玩包、故事结构与素材哈希。`npm run check:release -- --public` 另检查公开发布的审读和素材使用依据。

- `tools/prepare-story.ts`：首篇改编源码，产出梦包与完整审读稿。构建时自动运行。
- `tools/prepare-assets.py`：长曲切片、音效变体、角色副本与背景亮度测量。需 Python、Pillow、FFmpeg，原件只读。
- `npm run prepare:keepers`：单独重做六组官方动作、静帧和看板娘 SVG；需要 Python 与 Pillow。加 `-- --preview` 可用 CairoSVG 生成检查图。
- `src/game/`：确定性引擎、图验证、路径回放与存档。
- `src/runtime/`：音频、节拍、转场、资源加载与离线状态。
- `public/`：实际游戏资源；`assets/source/` 保存素材原件，`assets/work/` 保存加工中间件。

首本素材包：[little-demon.dreambook](public/books/little-demon.dreambook)。制作规范见 [入梦书规范 v1](docs/DREAMBOOK_FORMAT.md)，未来生成接口见 [织梦流程](docs/DREAM_WEAVER.md)。

工程现状和验收记录见 [落地与验收记录](docs/IMPLEMENTATION_STATUS.md)；剧情文字见 [首篇完整试玩审读稿](docs/STORY_REVIEW_PLAYABLE.md)；设计规范见 [文档索引](docs/README.md)。

当前为本地试玩版本。已沿用用户在 Claude 会话中确认的首篇与背景；本次新增的具体分支对白保留 AI 衍生标记。没有把新编写文本伪记成原作后续、知乎直答生成或已经公网发布。

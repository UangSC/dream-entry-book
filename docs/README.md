# 《入梦书》项目文档总索引

2026-09-13 第二轮更新：从固定单篇试玩扩展为可导入/导出的入梦书架，并加入可恢复的 96 秒多 Agent 制作流程模拟。实际契约见 [入梦书规范 v1](DREAMBOOK_FORMAT.md) 与 [织梦流程](DREAM_WEAVER.md)。本轮用户需求优先于下文早期“首版只播放预织故事”的范围。

同日角色更新：刘看山的六组动作与十二句入梦书主题短句分别按 5–30 秒随机切换，带 3.6 秒慢聚慢散的白色烟幕与逐字输出；看板娘按最新反馈暂时下掉，见 [角色设计](CHARACTER_DESIGN.md)。

> 读过的故事，值得一活。

设计基线：2026-09-12，二次元梦境书屋版。本文是唯一入口。

《入梦书》是一款中文短篇互动小说游戏。玩家进入刘看山守候的梦斋，借一段故事、做几次有代价的选择，带着自己的结局醒来。视觉采用清透的二次元背景、轻小说式界面与官方刘看山素材；故事保留原有时代、人物与题材。

设计的制作管线为**制作端调用知乎直答生成 → 人工审读 → 发布预织梦包 → 玩家免配置游玩**；本次首篇使用已经归档的知乎节选，由 Codex 本地编写改编梦包，实际过程见下文。织梦是制作能力，玩家打开已发布故事时不播放虚假的生成等待。后续在线生成另设服务端，见 API_GUIDE。

## 当前真实状态

更新于 2026-09-13。工程已完成首篇本地试玩闭环，具体结果以 [落地与验收记录](IMPLEMENTATION_STATUS.md) 为准。

- 已读取 Claude 会话 0d4b8b5a-deb2-4545-8d04-bca710e3294d，沿用用户已确认的《吃人心的小妖怪》选题、审读决定与五张剧情背景。
- React 界面、剧情引擎、路径回放、存档、分歧重玩、梦醒、梦册和设置已接通。
- 首篇为 10 节点、70 拍、3 次关键选择、2 个局部终幕。全部 8 种选择组合有自动验证。新编对白见 [完整试玩审读稿](STORY_REVIEW_PLAYABLE.md)。
- 背景 7 张；BGM 10 段、独立夜间环境声 1 段；SFX 4 组 12 条；官方角色已制作静帧和动画 WebP 副本。原件保留，长曲切片报告在 assets/work/audio/variants/。
- BGM 等功率交叉淡化、循环重叠、开场鼓点律动、波纹与模糊场景转场、文字效果及完整动效关闭已实现。
- 构建和 175 项自动测试已通过。离线清单按实际构建哈希生成，49 个资源缓存、完整性和部分缓存状态有验证；浏览器实测记录见落地文档。
- 当前是本地试玩版本，没有公网部署。用户先前确认继续有效；新编分支文本的最终构建签署、音乐听测和素材使用依据在整体试玩/发布阶段核对，不阻塞本地开发。
- 旧校园选题审读稿、旧实现成绩与未开始描述均属历史上下文，不代表当前状态。没有把本地 Codex 改编宣称为知乎直答调用成果。

## 阅读顺序与事实层级

首次接手：本文 → [审查与决策](REVIEW_AND_DECISIONS.md) → [游戏总纲](GAME_DESIGN.md) → [开发计划](DEVELOPMENT_PLAN.md)。按任务继续阅读下表。

规范冲突时：用户最新要求优先；API 事实以本地官方资料及后续实际响应核对；本轮设计文件规定产品行为；历史记录仅作线索。所有性能、时长、质量数字若无本轮实测，均是验收目标。

## 当前文档

| 文档 | 职责 |
|---|---|
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | 当前代码、真实验证、交接与后续事项 |
| [STORY_REVIEW_PLAYABLE.md](STORY_REVIEW_PLAYABLE.md) | 首篇完整分支对白与条件回响 |
| [REVIEW_AND_DECISIONS.md](REVIEW_AND_DECISIONS.md) | 审查发现、替用户作出的默认决策、剩余外部事实与改动理由 |
| [GAME_DESIGN.md](GAME_DESIGN.md) | 定位、核心循环、首版范围、体验验收 |
| [STORY_DESIGN.md](STORY_DESIGN.md) | 叙事、分支、来源边界、生成与人工审读 |
| [DREAMBOOK_FORMAT.md](DREAMBOOK_FORMAT.md) | 可导入/导出的 ZIP 素材包、媒体与来源规范 |
| [DREAM_WEAVER.md](DREAM_WEAVER.md) | 96 秒异步生成模拟、任务恢复与后续服务接口 |
| [DREAM_PACKAGE_SPEC.md](DREAM_PACKAGE_SPEC.md) | 梦包字段、状态语义、图校验、存档与版本契约 |
| [CHARACTER_DESIGN.md](CHARACTER_DESIGN.md) | 守梦人、角色卡、语气与人物表现 |
| [VISUAL_STYLE.md](VISUAL_STYLE.md) | 二次元美术、色彩、场景适配、手机构图 |
| [ART_PROMPTS_ANIME.md](ART_PROMPTS_ANIME.md) | 逐张生成顺序、可复制提示词、验收与返修 |
| [UI_AND_TEXT_EFFECTS.md](UI_AND_TEXT_EFFECTS.md) | 页面状态、推进交互、四种基础表现与 14 种文字效果库、无障碍 |
| [AUDIO_DESIGN.md](AUDIO_DESIGN.md) | 配乐音效资源池、来稿实测、变体与 DSP 约束、淡化循环与播放规则 |
| [RHYTHM_AND_PULSE.md](RHYTHM_AND_PULSE.md) | 鼓点驱动的页面心跳、节拍图契约、图层幅度预算与降级 |
| [ASSET_GUIDE.md](ASSET_GUIDE.md) | 官方文件映射、制作清单、素材清单契约与来源记录 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 目标模块、数据流、存储、离线与后续服务端 |
| [API_GUIDE.md](API_GUIDE.md) | 官方接口契约、历史结论纠正、缓存、错误与鉴权 |
| [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) | 最小可交付版本、依赖顺序与验收标准 |
| [HISTORY_AND_PITFALLS.md](HISTORY_AND_PITFALLS.md) | 历史经验的有效范围及本轮纠错 |

## 原始资料与历史文档

官方依据位于 [知乎 Skill](../zhihu/SKILL.md) 及 [references](../zhihu/references/hackathon.md)。它们本轮只作为资料核对，未修改，也未调用收费或配额接口。

以下五份保留原文，仅在顶部增加历史标记：[旧验收](verification.md)、[旧美术提示词](art-prompts.md)、[旧音频提示词](audio-prompts.md)、[旧 VIP 闭环](vip-flow.md)、[旧管线演示](zhihu-demo.md)。旧水墨方向、旧 BYO-Key 方案、旧路径和命令不应直接照搬。

新增文档必须登记本索引；字段与标识符用英文，说明、界面文案与素材提示用中文。设计目录不保存密钥或未脱敏请求。

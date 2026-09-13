# 素材指南

## 当前状态与命名

当前已有官方原件 `zhihu/imgs/` 中 6 个 GIF、3 个 JPG，合计 5,975,432 字节（约 5.70 MiB）。2026-09-12 又接收用户生成的 BG_GATE、BG_END，并完成 PNG 归档与 WebP 转换。同日接收音频来稿 5 首 MP3 + 9 条 WAV 并完成第一批加工：14 个原件归档到 `assets/source/audio/`，4 首 BGM 与 4 条音效发布到 `public/audio/`，`BGM_GATE` 的节拍图与音频清单已落盘。根目录 `bgm/`、`sfx/` 已不存在。客观指标全部达标，**人工听测尚未进行**。

同日再接收 3 个约 3 分钟的长主题曲（原为根目录 `.mp4`，实为带近静态封面的 MP4 容器，音频流是 AAC-LC 129kbps 44.1kHz 立体声）。已归档到 `assets/source/audio/`，并**无损**（`-c:a copy`，逐样本 MD5 校验一致）抽出音频到 `assets/work/audio/*.m4a`，视频流丢弃。根目录已无遗留音频文件。

**素材方向已于本轮修订**：目标不是把素材收敛成最少的成品，而是在体积可控的前提下建立**声音资源池**——同一动作保留不同强度／质感／场景的多个变体，长曲按段落派生多个变体。因此"落选"一词作废，改为 `reserve`（备用）：过于相似或质量不足的素材留在 source/work 层不发布，但一律不删除。池化后的分组、变体表、DSP 约束与体积预算拆分见 [声音设计](AUDIO_DESIGN.md)。其余背景仍未提供，且 `BG_ROOM_D`、`BG_STREET` 需按首篇实际剧情确定，不得凭空假定为阅读室。

| ID | 母版 | 发布资源 | 时长 | 大小 | 关键指标 |
|---|---|---|---|---|---|
| `BGM_GATE` | `assets/source/audio/bgm_1_1m40s.mp3` | `public/audio/bgm-gate.mp3` | 99.420s | 1,591,724 字节 | −20.4 LUFS / −12.2 dBTP / LRA 1.7 LU，72.000 BPM |
| `BGM_THEME` | `assets/source/audio/bgm_2_1m00s.mp3` | `public/audio/bgm-theme.mp3` | 58.960s | 944,300 字节 | −20.4 LUFS / −11.6 dBTP / LRA 1.7 LU |
| `BGM_DREAM` | `assets/source/audio/bgm_3_1m00s.mp3` | `public/audio/bgm-dream.mp3` | 58.000s | 928,940 字节 | −20.4 LUFS / −8.0 dBTP / LRA 9.4 LU |
| `BGM_END` | `assets/source/audio/bgm_5_30s.mp3` | `public/audio/bgm-end.mp3` | 28.890s | 463,148 字节 | −20.5 LUFS / −8.3 dBTP / LRA 17.2 LU |
| `SFX_PAGE` | `assets/source/audio/翻页声#3.wav` | `public/audio/sfx-page.wav` | 0.340s | 32,718 字节 | 峰值 −16.0 dB，裁 0.380–0.720s |
| `SFX_CHOICE` | `assets/source/audio/轻触确认_文件_#1.wav` | `public/audio/sfx-choice.wav` | 0.115s | 11,118 字节 | 峰值 −20.0 dB，裁 0.030–0.145s（仅取第一下） |
| `SFX_DREAM_IN` | `assets/source/audio/推开梦门__#3.wav` | `public/audio/sfx-dream-in.wav` | 0.860s | 82,638 字节 | 峰值 −14.0 dB |
| `SFX_DREAM_OUT` | `assets/source/audio/合页梦醒_#3.wav` | `public/audio/sfx-dream-out.wav` | 0.900s | 86,478 字节 | 峰值 −14.0 dB |

另有 `public/audio/bgm-gate.beats.json`（2,746 字节，节拍图侧车）与 `public/audio/manifest.json`（8,359 字节，status=draft，8 项资产哈希已校验）。`assets/work/audio/` 保存加工中间件与未发布的 `bgm-dream-alt.mp3`（来自 `bgm_4`，已归一化，备用）。

| ID | 原始母版 | 网页静态资源 | 实际尺寸 | WebP 大小 |
|---|---|---|---|---|
| `BG_GATE` | `assets/source/art/bg-gate.png` | `public/art/bg-gate.webp` | 1672×941 | 151,520 字节（约 148 KiB） |
| `BG_END` | `assets/source/art/bg-end.png` | `public/art/bg-end.webp` | 1672×941 | 161,128 字节（约 157 KiB） |

网页加载路径分别为 `/art/bg-gate.webp`、`/art/bg-end.webp`。转换使用 WebP quality=90、method=6，保留原尺寸、未裁切或放大。原始 PNG 已从项目根目录移动到母版目录。

变体 ID 沿用同一命名规则：`BGM_LONG_C_CALM` → `bgm-long-c-calm.m4a`，`SFX_PAGE_DEEP` → `sfx-page-deep.wav`。母曲 ID 只用于 source/work 层的溯源，不出现在发布清单里。

`public/art/manifest.json` 已记录尺寸、真实文件哈希、来源与转换信息，目前 status=draft：生成工具、模型与适用条款尚未提供，保持未知，不补造。此状态不影响本地开发使用，正式发布前需补全并由发布器校验。

资产 ID 使用 `BG_`、`BGM_`、`SFX_`、`MASCOT_` 前缀；文件名将 ID 转小写并用连字符替换下划线，例如 `BG_ROOM_D` → `bg-room-d.webp`。中文原件名称保留，只给发布副本用英文名。

## 首版制作清单

| 类别 | ID | 状态/顺序 |
|---|---|---|
| 背景 4 张 | `BG_GATE`、`BG_ROOM_D`、`BG_STREET`、`BG_END` | BG_GATE/BG_END 已接收并转换；另两张待选题匹配 |
| BGM 基础 4 首 | `BGM_GATE`、`BGM_THEME`、`BGM_DREAM`、`BGM_END` | 已归一化到 −20 LUFS-I、真峰值 ≤−8 dBTP、曲间差 0.2 LU 并转码发布；待人工听测 |
| BGM 长曲母带 3 首 | `BGM_LONG_A`、`BGM_LONG_B`、`BGM_LONG_C` | 已归档并无损抽出音频；段落切点为机器建议，待人工定乐句边界与角色归属 |
| BGM 变体（派生） | `*_CALM`、`*_BODY`、`*_PEAK`、`*_SLOW`、`BGM_DREAM_ALT` | 每母曲 2–4 个，30–60s 可循环；母曲整曲不进发布层。`_SLOW` 须听测通过才发布 |
| 音效 4 组 12 个变体 | 翻页 4 / 确认 4 / 入梦 2 / 梦醒 2，另 1 条 `reserve` | 4 个默认成员已发布；其余变体待加工。`sfx-page.wav` 需按组表改名重算 |
| 节拍图 | `bgm-gate.beats.json` | 已实测 72.000 BPM / 112 拍 / 28 强拍，`verifiedByHuman` 仍为 false |
| 角色首批 | `MASCOT_STILL`、`MASCOT_IDLE`、`MASCOT_GREET` | 从官方 GIF 提取/转换，无需重画 |
| 界面 | 纸卡、书签、按钮、简单图标 | CSS/SVG 绘制，文字实时排版，不向生图工具索取带字整页 |

背景提示词见 [ART_PROMPTS_ANIME.md](ART_PROMPTS_ANIME.md)，音频提示词、实测数据与加工工序见 [AUDIO_DESIGN.md](AUDIO_DESIGN.md)，节拍图与视听同步契约见 [RHYTHM_AND_PULSE.md](RHYTHM_AND_PULSE.md)。首版不做人物立绘、剧情 CG、抽卡道具或成套十张背景。

## 外部来稿素材（2026-09-12 第三批）

用户另从别处取得一批素材（原 `goods/`），已核对并整理：3 个与已归档母版**逐字节相同**的重复文件已删除（两份等于 `bg-gate.png`，一份等于 `bg-end.png`），其余 11 个按类型进入 source 层。另有一个 `PosterGirl.svg` 归入 `reserve/`。`goods/` 目录已移除。

```text
assets/source/art/
  bg-candidate-sky-hall.png     1672×941 不透明，天空书阁式阅读大厅
  props/    mist-glow.png  reading-lamp.png  glass-dome.png  open-book.png
  ui/       choice-card-1.svg  choice-card-2.svg
            button-1.svg  button-2.svg  button-3.svg  button-magic.svg
  reserve/  poster-girl.svg     480×720，1072 路径，原件保留；现用于梦斋小馆员
```

四个道具 PNG 均带透明通道（全透明占比 55–79%），可直接作为舞台叠加层。六个 UI SVG 是真矢量：无内嵌位图、无 `<script>`／事件属性、无 `<text>`、无远端引用，可安全内联。SVG 里的按钮与卡片**只作为视觉参考**：正文与按钮文字仍按 [界面与文字演出](UI_AND_TEXT_EFFECTS.md) 实时排版，不使用带字图片。

`bg-candidate-sky-hall.png` 尺寸与现有两张一致，但**未**分配 `BG_ROOM_D` 或 `BG_STREET`——槽位仍按首篇实际剧情确定，故命名为 candidate。这批素材只进 source 层，尚未转 WebP、未进 `public/`、未登记发布清单。

### 生成来源已确认

本轮从文件内嵌的 C2PA/JUMBF 清单中读出了真实生成信息，此前记为 `pending` 的工具字段已可填写：

| 素材 | 生成工具 | 版本 | digitalSourceType |
|---|---|---|---|
| `bg-gate.png`、`bg-end.png`、`bg-candidate-sky-hall.png` | `gpt-image`（OpenAI Media Service API） | 2.0 | trainedAlgorithmicMedia |
| `props/*.png`、`reserve/poster-girl.svg` | `recraft.ai` | 构建号 `81ce82e2` | trainedAlgorithmicMedia |
| 全部音频 | 未知（文件内只有 `Lavf` 封装标记） | — | — |

`public/art/manifest.json` 的 `source.tool`／`model`／`generatedAt` 已据此补全。**但 `rights.status` 仍为 `pending`**：知道用哪个工具生成，不等于知道该账号档位下的授权范围与商用条款——两者是不同的事实，不能用前者推断后者。音频的生成工具仍然未知。

## 官方素材映射

下列均是当前实际原件的相对路径。动画时长来自文件名且须在转换时核对实际帧时序，不以文件名代替检查。

| ID | 原件 | 使用方式 |
|---|---|---|
| `MASCOT_IDLE` | `zhihu/imgs/看山动态图/待机_5秒_320x320_20fps_透明.gif` | 首页、梦醒待机 |
| `MASCOT_WAVE` | `zhihu/imgs/看山动态图/打招呼_4秒_320x320_20fps_透明.gif` | 首页随机动作；原设计名 MASCOT_GREET |
| `MASCOT_SWAY` | `zhihu/imgs/看山动态图/晃悠_320x320_3秒_20fps_透明.gif` | 后续选梦装饰 |
| `MASCOT_COMPUTER` | `zhihu/imgs/看山动态图/电脑_6秒_320x320_20fps_透明.gif` | 真实制作状态，首版玩家页不用 |
| `MASCOT_DOZE` | `zhihu/imgs/看山动态图/瞌睡_5秒_320x320_20fps_透明.gif` | 后续首页闲置 |
| `MASCOT_DRIBBLE` | `zhihu/imgs/看山动态图/运球_4秒_320x320_20fps_透明.gif` | 后续彩蛋 |
| `MASCOT_STILL` | 从待机 GIF 的清楚稳定帧提取 | 静帧兜底与关闭动画 |
| `MASCOT_SHEET_1` | `zhihu/imgs/看山三视图/33f11967cc145627560c3db70c7d3ab8.jpg` | 三视参考板，不当透明角色 |
| `MASCOT_SHEET_2` | `zhihu/imgs/看山三视图/c8d9642e1d6a402907200a8fed6c0fc3.jpg` | 白底姿态参考 |
| `MASCOT_SHEET_3` | `zhihu/imgs/看山三视图/de232c5a0202dd7512ec1b7bddd150d8.jpg` | 绿底姿态参考 |

保留原色、比例与面部，不重绘、不让 AI 复刻。独立地面阴影可以作为 UI 层添加。三张 JPG 没有透明通道；不得直接把绿底图覆盖在背景上。

实际发布文件为 `public/mascot/idle.webp`、`wave.webp`、`sway.webp`、`computer.webp`、`doze.webp`、`dribble.webp`，静帧为 `still.webp`。采用有损质量 82，逐帧按时间轴比较原 GIF 与 WebP，核对总时长与画面；重复静止帧可由编码器合并，manifest 同时记录 sourceFrames 与实际 frames。按用户最新要求，六组动作在首页每 5–30 秒随机换一组。

`tools/prepare-keepers.py` 统一生成角色副本和完整 manifest（含静帧、原件来源、哈希、字节数与转换说明）。`public/mascot/librarian.svg` 由预留看板娘原件叠加可编辑细节层生成，SVG 不通过第三方素材包导入；入梦书 v1 的 SVG 禁止规则不变。

## 音频三层目录

来稿原名保留，只给发布副本用英文名。三层职责固定，不为了"整洁"牺牲素材丰富度：**source 存全部原始素材，work 存裁剪/变速/loop/混音等中间版本，public 只存游戏实际加载的版本**。

```text
assets/source/audio/     17 个原件母版，原名不改，不随网页分发，19.03 MiB
  bgm_1_1m40s.mp3 .. bgm_5_30s.mp3            第一批 5 首
  i0bccnp4zcdmtyd4sld.mp4                     长曲 A（3:33，含近静态封面）
  bm96be092dlmtyd53h8.mp4                     长曲 B（3:08）
  ceu2aa6gu7smtyd5wjc.mp4                     长曲 C（3:12）
  翻页声#1..3.wav                              3 条
  轻触确认_文件_#1..2.wav                       2 条
  推开梦门__#2..3.wav                           2 条
  合页梦醒_#2..3.wav                            2 条

assets/work/audio/       中间件，不发布，无体积上限，当前 10.34 MiB
  i0bccnp4zcdmtyd4sld.m4a 等 3 个              长曲无损抽轨（-c:a copy）
  page/choice/dream-in/dream-out.wav          配平前的裁切结果
  bgm-dream-alt.mp3                           bgm_4 归一化版，可升为 BGM_DREAM_ALT
  （待建）段落切片、变速版、24-bit 处理中间件

public/audio/            发布资源，当前 3.96 MiB
  bgm-gate/theme/dream/end.mp3                基础 4 首
  sfx-page/choice/dream-in/dream-out.wav      4 组的默认成员
  bgm-gate.beats.json                         节拍图侧车
  manifest.json                               status=draft
  （待建）BGM 变体 *.m4a、音效变体 *.wav
```

`reserve`（备用）指留在 source/work、暂不发布的素材，当前只有 `轻触确认_文件_#2`（峰值 −43.3 dB，无明显瞬态，提增益会一并抬底噪）。备用素材**不删除**，清单里也不出现；日后若做出可用变体再升级。

网页加载路径为 `/audio/bgm-gate.mp3`、`/audio/sfx-page.wav`、`/audio/bgm-long-c-calm.m4a` 等；节拍图为 `/audio/bgm-gate.beats.json`。

音频清单除通用必需字段外还要有 `durationSeconds`、`loop`；`loop` 为对象，记录 `mode`（`seamlessLoop`/`fadeLoop`/`none`）、`startSeconds`、`endSeconds`、`overlapMs`（fadeLoop 时必填）。驱动律动的曲目再记 `beatsFile` 与 `beatsSha256`——侧车会驱动画面，损坏或被替换必须能被发现。侧车不单独登记为 assets 条目：它不属于 background/mascot/music/sfx 任何一类，随主音频发布与失效。

派生变体额外记 `derivedFrom`（母曲或原件 ID）与 `variantOf`（同组默认成员 ID），使一条发布资源能回溯到 source 层的具体文件与处理参数。同组变体共享 `variantOf`，播放器据此知道哪些可以互换。

音频的 `source` 与 `rights`：全部素材的生成工具、模型、账号与适用条款**未知**，因此 `rights.terms`、`rights.scope`、`rights.attribution` 与 `source.author`、`source.toolModel` 一律记 `pending`，不能填"已授权"。这是当前两份清单 `status` 只能是 draft 的直接原因。`modifications` 必须如实列出段落时间窗、伸缩比例、滤波参数、增益量、归一化目标与转码参数，数值由工具输出。

体积预算按"库总量"与"单次加载量"分开核算，池化后两者不再等价，明细见 [声音设计](AUDIO_DESIGN.md)。关键一条：库总量可以超过 12 MiB，**单次会话实际加载**不能超。当前发布层 3.96 MiB，其中首屏预载 `BGM_GATE` + `SFX_CHOICE` + 首张背景约 1.67 MiB，**超出"首屏 ≤1.5 MiB"目标约 0.17 MiB**——`bgm-gate.mp3` 单文件就 1.518 MiB，实现时须改为边下边播或延迟到首次用户操作后再取。

## 背景与体积预算

母版至少 1920×1080，优先 2560×1440；发布 WebP 单张目标 250–550 KiB，细节复杂可重新权衡，不牺牲关键阅读空间。手机使用顶部横图时可共用；居中裁切确实丢信息才另做竖版。

当前两张用户原图为 1672×941，作为首版开发素材接收并如实记录，暂不放大；后续按实际大屏效果决定是否补高分辨率版本。250–550 KiB 是预算参考，清晰度足够时更小的文件可以直接采用。

首屏应用资源与静帧、首张背景合计目标 ≤1.5 MiB；首篇全部资源目标 ≤12 MiB。不要把六个角色动画、所有字体字形、三张参考 JPG 一起预载。首批静帧 + 待机 + 招手合计目标 ≤800 KiB，达不到时先静帧、动画延后加载，目标不能写成实测。

母版、加工版本和发布资源分开保存。文件系统路径用 Path/path.join，浏览器 URL 按资源路由构造；不能把 Windows 路径直接传给 URL 构造器。

## manifest 与梦包资产绑定

每类发布目录一个 `manifest.json`，顶层 `manifestVersion: 1`、`status`（draft/ready）与 `assets` 数组。draft 用于本地素材准备，正式发布只接受 ready 且各项依据完整的清单，不能仅凭目录名 public 判断已经发布。每项必需：`id, kind, file, sha256, bytes, source, rights, modifications`；图片再含 width/height/animated，音频含 durationSeconds/loop，派生变体再含 derivedFrom/variantOf。kind 为 background/mascot/music/sfx。实际文件名、哈希与大小由加工工具计算，不能让模型猜。

`source` 保存 type（official/ai_generated/licensed）、名称、原件路径或来源 URL、作者/工具模型、日期。`rights` 保存适用条款引用、适用范围和所需署名；未知明确记 pending，不能填“已授权”占位。`modifications` 如实列格式转换、压缩、裁切等。

`file` 必须为当前资源目录下相对路径，禁止绝对路径、协议、`..` 和远端代码。ID 在一次发布的合并清单中唯一；同 ID 不同年代图不能同时无规则覆盖。同组音效变体是**不同 ID**（`SFX_PAGE` 与 `SFX_PAGE_DEEP` 各占一项），不是同一 ID 的多个文件；变体之间的可互换关系由 `variantOf` 表达，不靠 ID 前缀猜。故事包的目录条目显式绑定对应资源集版本，按该映射解析 BG 语义槽。

发布目录 catalog 每项记录 `packageId, buildId, packageFile, packageSha256, assetSetId, title, estimatedMinutes`；独立资源集清单将资产 ID 映射到具体文件及哈希。换任一资源必须更新资源集版本，目录与旧包一并保留。没有通过来源与完整性检查的文件不能进入正式清单。

## 来源与使用范围

知乎提供文件不等于附带永久商用许可。本地没有完整 IP 使用条款附件，暂按赛事场景规划，并在实际发布前记录适用条款；不据此中断本轮设计。原件不改动，素材页说明“刘看山形象及相关素材来自知乎官方”。本项目的守梦人台词属于项目设定。

背景/音频按实际生成工具与账号条款登记；选源保留原链接和许可，CC-BY 提供署名；字体保留具体版本的 OFL 文件。比赛正文、封面与头像分别核对用途，不因故事接口返回图片 URL 就假定可无限分发。

制作顺序：首张定调 → 手机/桌面构图检查 → 同参考生成余图 → 压缩与格式检查 → 来源清单 → 浏览器组合验收。每张图只要一份通过验收的版本，避免没有方向地批量生成。

# 入梦书素材包规范 v1

更新于 2026-09-13。**入梦书**是一份可导入、可导出、可离线游玩的完整故事素材包。第一本为女巫《吃人心的小妖怪》，实际示例在 [little-demon.dreambook](../public/books/little-demon.dreambook)，清单示例在 [example-manifest.json](../public/books/example-manifest.json)。

本规范定义分发容器；`story.json` 的剧情状态机继续遵循 [DREAM_PACKAGE_SPEC.md](DREAM_PACKAGE_SPEC.md)。两者独立版本化，不能把存档 JSON 当作素材包。

## 容器与目录

扩展名 `.dreambook`，内容为标准 ZIP；导入器也接受 `.zip`。根目录必须直接放置 `book.json` 与 `story.json`，不要额外套一层文件夹。

```text
little-demon.dreambook
  book.json                  包规格、演出元信息、完整素材清单
  story.json                 剧情、人物、分支、条件与结局
  art/bg-shrine-n.webp        图片；示例实际文件名以清单为准
  audio/bgm-dream.mp3         音乐
  audio/sfx-page.mp3          互动音效
  audio/ambience-night.wav    很轻的蟋蟀与蛙声环境层
```

包中不含用户存档、梦签、API 密钥、程序代码、HTML、SVG 或外部资源依赖。素材只能使用包内相对路径，不能有 `..`、绝对路径、反斜线、URL 或重复文件名。文件名使用英文、数字、连字符、下划线；不接受隐藏文件。

最大压缩文件 80 MiB；展开后合计 120 MiB；最多 180 个条目、160 个媒体资源；单文件 24 MiB、单 JSON 1 MiB。先验证 ZIP 目录再展开，避免超限内容占用内存。

## book.json

必需字段如下，未知字段拒绝。完整可执行的字段定义在 [src/books/schema.ts](../src/books/schema.ts)。

| 字段 | 内容 |
|---|---|
| `format` | 固定为 `rumengshu.dreambook` |
| `formatVersion` | 固定为 `1` |
| `story` | 固定为 `story.json` |
| `storySha256` | `story.json` 实际 UTF-8 字节的 SHA-256，小写十六进制 |
| `creator` | 素材包制作者，不能代替原作作者 |
| `description` | 制作说明，最多 800 字符 |
| `simulation` | 是否为生成流程演示产物，默认 false；演示产物必须 true |
| `presentation` | 封面、简介、章节标题和场景演出 |
| `assets` | 全部图片、音乐、音效清单 |

`packageId`、`buildId`、故事标题和原作者以 `story.json` 为准，不在清单重复建立第二套身份。逻辑内容修改必须更换 `buildId`。相同版本且内容一致时重复导入不增加副本；同一版本内容冲突则拒绝覆盖。内容指纹基于解析后的清单和已验证的剧情、素材哈希，重新压缩的 ZIP 时间戳不改变身份。

### presentation

| 字段 | 规则 |
|---|---|
| `cover` | 图片素材 ID，例如 `BG_SHRINE_N` |
| `subtitle` | 封面短句，最多 100 字符 |
| `description` | 入梦前简介，最多 800 字符 |
| `tags` | 最多 5 个短标签 |
| `contentNote` | 题材与改编说明，最多 400 字符 |
| `chapters` | `{节点 ID: 章节标题}`，必须指向真实节点 |
| `performances` | 可选，`{拍 ID: {portrait: 图片素材 ID, label: 中文替代文字}}`；立绘随包携带，引用必须存在 |
| `scenes` | `{图片 ID: {label, time, particles, ambience?}}` |
| `dreamMusic` | 可选，梦内默认音乐 ID；不填则不提供默认配乐 |
| `endingMusic` | 可选，梦醒页面音乐 ID |
| `endingScene` | 可选，梦醒页面背景 ID；不填则沿用终幕背景 |

`time` 为 `day/night/dawn/indoor`，`particles` 为 `fireflies/leaves/none`。`ambience` 引用一条 music 素材，由独立环境声声道播放，初始音量很轻。没有该字段就不播放环境声。场景粒子不会影响剧情；玩家关闭动态效果或系统减少动态效果时全部停用。

```json
{
  "BG_SHRINE_N": {
    "label": "山顶 · 小土庙",
    "time": "night",
    "particles": "fireflies",
    "ambience": "BGM_NIGHT_AMBIENCE"
  },
  "BG_FOREST_D": {
    "label": "山间 · 林径",
    "time": "day",
    "particles": "leaves"
  }
}
```

应用梦斋的背景、主题音乐、刘看山以及整页入梦/出梦转场属于应用外层。导入的新书不会替换梦斋；梦内不启用音画律动。

### assets

每条素材必须有 `id/kind/path/mime/bytes/sha256/credit/rights`。

| 类型 | ID | 格式 | 额外字段 |
|---|---|---|---|
| `image` | `BG_...` | WebP / PNG / JPEG | 可选 `luminance`，范围 0–1 |
| `music` | `BGM_...` | MP3 / WAV / OGG | 必需 `durationSeconds`；可选 `loop` |
| `sfx` | `SFX_...` | MP3 / WAV / OGG | 必需 `durationSeconds`，不允许 loop |

`mime` 使用对应的 `image/webp`、`image/png`、`image/jpeg`、`audio/mpeg`、`audio/wav`、`audio/ogg`。导入器检查文件头、字节数和 SHA-256，不只相信扩展名。

`loop` 为 `{mode, startSeconds, endSeconds, overlapMs, verified?}`；mode 为 `fadeLoop/seamless/once`。开始必须早于结束，结束不能超过音频时长，重叠不能超过区间一半。每条声音最多 600 秒。`verified` 记录人工循环听测状态，不能因为程序播放成功就写成 true。

`credit` 保留素材署名；`rights` 保存使用依据或待核对状态。入梦书导出会原样保留这些记录；导入通过不代表获得作品的再分发授权。

## 剧情、署名与链接

首本沿用 `hackathon_excerpt` 来源，原作者为 **女巫**，原作名为 **吃人心的小妖怪**，发布日期为 **2026-04-10**。用户于 2026-09-13 提供了[文章直链](https://www.zhihu.com/market/paid_column/2025960728138401447/section/2025954672918163637)和[作者主页](https://www.zhihu.com/people/cc09d82355e21162462ba02ac9717dba)，已写入 `story.json` 的 `sourceUrl`、`authorUrl`、`publishedAt`。封面下、入梦介绍、阅读页和梦醒处的“来自知乎”直接前往文章，作者署名可进入主页；来源说明显示发布日期和明确的作者主页入口。页脚另保留“去知乎，发现更多故事”总入口。其他缺少原文链接的包仍使用明确的搜索入口。

为第三方入梦书新增 `original_work` 与 `external_excerpt` 来源类型，保留 `original_demo` 的历史兼容。原创作品的 `workId` 必须为 null；外部节选必须 `completeness=excerpt`。新来源类型允许无内嵌凭证的 HTTPS 原文链接；知乎比赛来源继续采用原有知乎主机白名单。界面不会把外部作品标为来自知乎。

剧情包通过原有严格校验：长度与引用、无环图、全部节点可达、全部路线可结束、可执行选择、条件与数值范围、终幕见证路径。脚本、任意表达式和可执行插件不属于 v1 规范。

## 存储、导入与导出

1. 选择文件，检查容器上限和路径。
2. 验证清单、剧情与全部媒体哈希、媒体类型和图状态。
3. 全部通过后，以单个 IndexedDB 事务提交完整归档及封面；失败不产生半本书。
4. 从书架选择后，创建临时 Blob URL 加载图片与音频，不向外网请求素材。
5. 存档按 `packageId + buildId` 隔离；不同版本并存，共享梦册按故事/版本/结局去重。
6. 导出素材包得到 `.dreambook`，不含玩家个人进度；设置内另行导出当前书的存档备份。

旧单篇存档仅在构建号一致时复制进新命名空间，原记录保留。删除当前进度后不会从历史记录反复恢复。

## 制作与验证

```powershell
npm run prepare:story
npm run prepare:book
npm run check:release
npm test
```

`prepare-book` 为首本生成低音量环境声、制作归档并立即用浏览器相同的导入器重新校验。`npm run build` 自动执行这两个制作步骤。

创作者可将首本导出后解压作为样例，修改剧情及素材、更新 buildId，然后使用工具自动更新字节数与哈希并验证：

```powershell
npm run book:pack -- --input ./my-book-source --output ./my-new-book.dreambook
```

输出文件必须尚不存在，工具不覆盖旧包。封面、章节和素材路径的契约必须仍然满足本规范；不要手改完文件却沿用旧哈希。

生成入口的当前实现与后续服务端接口见 [DREAM_WEAVER.md](DREAM_WEAVER.md)。

### 选择的情绪演出

可选 `presentation.choiceMoods` 以选项 ID 为键，值为 `warm`（温暖）、`resolute`（笃定）、`hesitant`（犹豫）、`guarded`（撑住面子）、`bashful`（害羞接受）或 `breezy`（轻松）。选项 ID 必须存在于剧情中；没有配置时使用温暖样式。配置仅改变选择外观、适度交互及收尾动画，不改变选项文本、条件或分支结果。

播放器将选项放在中央。犹豫仅对鼠标短暂小幅闪躲，点击范围不移动；触屏、键盘和减少动态效果模式保持直接可选。所有动画均可随动态效果设置关闭。

### 日常闲话

可选 `presentation.asides` 以主线台词 ID 为键。每段包含 2–3 个 `options`，每个选项指定 `id`、`text`、`mood`，以及 1–4 句 `replies`（`speaker`、`text` 和可选的 `portrait`）。播放器在该句之后展示选择，逐句播放选定回应，再继续下一句主线。它不写入主线旗标，不改变节点与结局。角色、素材、触发台词引用和选项 ID 唯一性均在导入时验证。

闲话停留位置另存本书的本地书签，刷新或保存离梦后能接续；从头入梦或回望产生新的阅读位置时重新选择。跨设备导入仍按主线存档恢复，停在闲话中导出的存档会回到触发它的那句主线。

# 梦包数据契约 v1

2026-09-13：本文继续规定 `story.json` 的剧情契约。完整素材分发容器使用新设的 [入梦书规范 v1](DREAMBOOK_FORMAT.md)。新增来源类型 `original_work`（原创作品，workId=null）与 `external_excerpt`（外部作品节选，completeness=excerpt）；两者可使用无内嵌凭证的 HTTPS 来源链接。已有知乎来源白名单规则保持有效。角色、简介、章节标题和昼夜环境配置由容器 presentation 提供。

本文件是待实现的字段规范，不代表已有 Zod schema。首版严格接受 v1；制作格式可以丰富，发布格式只保留运行所需内容。JSON 字段与 ID 全部使用英文。

## 顶层对象

| 字段 | 类型与约束 | 含义 |
|---|---|---|
| `schemaVersion` | 整数，固定 1 | 数据结构版本 |
| `packageId` | 内容 ID | 同一故事包的稳定标识 |
| `buildId` | 内容 ID | 每次内容或逻辑修改产生新值，不复用 |
| `title` | 非空字符串，≤80 字符 | 游戏短篇名，原作品名称另存 source |
| `source` | 对象 | 来源、归属、节选、外链核对状态 |
| `review` | 对象 | 审读状态及绑定的构建 |
| `theme` | `calm / warm / mystery` | 有限预设，不接受任意 CSS |
| `characters` | 角色数组 | 0–6；正式首篇目标 2–4 |
| `resources` | 资源数组 | 0–2；整数上下界、初值、显示名 |
| `relationships` | 关系数组 | 0–1；关联人物、整数范围与初值 |
| `flags` | `{id, label, kind}[]` | 已知事实或承诺，kind 为 knowledge/commitment，初值 false |
| `entryNodeId` | 节点 ID | 唯一起点 |
| `nodes` | 节点数组 | 非空；正式首篇 8–12，最小测试包可少于此数 |

内容 ID 统一匹配 `^[a-z][a-z0-9-]{0,63}$`，资源/人物/节点/拍/选项均使用此规则。资产 ID 单独匹配 `^(BG|BGM|SFX|MASCOT)_[A-Z0-9_]+$` 并在 manifest 白名单中存在。不要把资产 ID 与剧情 ID 混用。

人物、资源、关系、标记各自在本类数组内唯一；节点、拍、选项和终幕 ID 各自在整个包的同类型集合内唯一。`narrator` 保留给旁白，不能用作人物 ID。source 的 workId 是外部标识，不套用剧情 ID 正则。字符串长度按 Unicode 码点计，数值使用 JavaScript 安全整数，计算增量后也要检查安全整数范围。

`source` 必需字段：`kind`（hackathon_excerpt / original_demo / original_work / external_excerpt）、`title`、`author`（未知时 null，UI 显示“作者信息待核对”）、`workId`（字符串或 null）、`completeness`（excerpt / complete）、`trailingFragment`（布尔）、`sourceHash`、`paragraphIds`、`sourceUrl`（HTTPS 或 null）、`linkStatus`（verified / missing）、`rightsRef`（制作端依据记录的标识）。complete 仅用于经核对确为完整的原创示例，不用于比赛节选。

可选字段：`authorUrl` 为无内嵌凭证的 HTTPS 作者主页，知乎节选要求主机位于知乎白名单；`publishedAt` 为有效的 `YYYY-MM-DD` 原作发布日期。旧包可省略这两个字段。它们随素材包导入导出，主页链接用于作者署名，日期在来源说明展示。

`sourceHash` 是规范化来源文本 UTF-8 字节的 SHA-256，小写 64 位十六进制；原始响应哈希另存制作档案。`sourceUrl` 为 verified 才可渲染“原文”按钮；URL 必须在受控知乎主机白名单中，拒绝脚本协议与近似域名。

规范化只把 CRLF/CR 换成 LF，不补字、不删空白；按非空行编号 `p-0001`、`p-0002`，段落表保留文本及在该版本中的位置。paragraphIds 列出可引用编号。hackathon_excerpt 要求 workId 非空、completeness 为 excerpt；original_demo 的 workId 为 null。verified 要求非空且核验过的 URL，missing 要求 sourceUrl=null。正式发布时来源作者与使用依据必须完成核对；未知作者只可存在于草稿。

`review` 必需字段：`status`（draft / approved）、`reviewedBuildId`、`reviewedAt`（ISO 日期时间或 null）、`reviewer`（内部标识或 null）。发布要求 approved 且 reviewedBuildId 等于 buildId。制作端审读记录另绑定规范化内容哈希；不能只改 status 就绕过审读流水线。首版不接受任意用户导入包。

approved 还要求有效 reviewedAt 与非空 reviewer；公开包的 reviewer 使用团队角色代号。审读哈希对去掉 review 的 JSON 对象递归排序键后紧凑 UTF-8 序列化计算，数组保留顺序，不修改字符串；生成、审读、发布使用同一实现。最终文件的完整字节哈希另写 catalog，避免自引用哈希。发布器核对内部审读档案，不能仅信任模型给出的 approved。

角色字段：`id, name, role, desire, flaw, voice, sourceRefs`；voice 是中文字符串，含语气规则与样例。资源字段：`id, label, min, max, initial`；关系增加 `characterId`。全部数值为有限整数，min ≤ initial ≤ max。

## 节点、拍与连接

每个节点必需 `id, kind, origin, sourceRefs, scene, beats`。kind 为 scene / ending；origin 为 adapted / original；sourceRefs 是来源段落 ID 数组。adapted 至少 1 个真实引用，original 可引用基础事实但不会因此成为 adapted。

- scene 节点恰好二选一：`next`（节点 ID），或 `choices`（2–3 项）。不能两者都有，也不能两者都没有。
- ending 节点有 `ending: {id, title, summary}`，无 next/choices。summary 只描述当前路线结果；title ≤80 字符，summary ≤400 字符。
- scene 为背景资产 ID。进入节点先恢复此背景，再按拍执行有限指令。
- `beats` 至少 1 项。每拍必需 `id, kind, speaker, text`；kind 为 narration/dialogue/thought。narration 的 speaker 必须为 narrator；其余必须是角色 ID。text 是纯文本、最多 240 字符。
- 可选 `when` 控制条件拍；节点至少有一个无条件拍，避免整页为空。回顾记录只含实际展示的拍。
- 可选 `anim` 为 fade/typewriter/emphasis/none；默认 fade。thought 可以用 typewriter，dialogue 也可用，含义不是角色身份校验。
- 可选 `effect` 为文字演出，与 `anim` **互斥**（同时出现即校验失败）。形如 `{type, durationMs?, intensity?}`。`type` 取自白名单：入场类 `emerge`/`focusIn`/`inkBloom`/`particleGather`/`liquid`/`dreamRipple`/`pageTurn`/`scramble`，退场类 `shatter`/`dissolve`/`particleScatter`/`inkFade`，持续类 `float`/`breathe`（持续类仅用于标题、终幕名、梦签短句，不用于正文拍）。`durationMs` 必须落在该 type 的预算区间内，持续类不接受该字段。`intensity` 仅接受 soft/normal。不接受自定义 CSS、着色器、URL 或任意参数对象。
- `effect` 配额：入场类 + 退场类合计 ≤6 拍，其中拆字类（`shatter`/`scramble`/`inkBloom`）合计 ≤3 拍；单包入场类种类 ≤4、退场类 ≤2；同一路线连续 4 拍内不得出现 2 次。超限由发布器判定失败。白名单以 [界面与文字演出](UI_AND_TEXT_EFFECTS.md) 为准，三处（本文、schema、校验器）不一致时以该文档为准。
- 可选 `sfx` 为白名单音效 ID。音效按组提供多个变体（如 `SFX_PAGE_SOFT`/`SFX_PAGE`/`SFX_PAGE_DEEP`/`SFX_PAGE_DREAM`），梦包可指定具体变体；只写组默认 ID 时由播放器按该组规则处理。翻页组允许运行时随机不重复轮播，确认、入梦、梦醒三组必须由作者显式指定，不随机。变体 ID 同样须在 manifest 白名单中存在。
- 可选 `sceneShift` 为背景 ID。
- 可选 `musicCue` 为 `{action: play, track: BGM_ID}`、`{action: silence}` 或 `{action: resume}`。play 的 track 必需；其他 action 禁止 track。恢复没有历史曲目时维持静默。

“刘看山边界演出”和来源页由应用外层负责，不强塞一个人物到每个梦包的角色数组。画面上标记来源性质从当前节点 origin 得到。

ending 可选 `reflections`（最多 4 条 `{text, when?}`）与 `outcomes`（最多 6 条 `{characterId, text, when?}`），text 均 ≤160 字符。用终幕状态评估同一 when 语法，按数组顺序展示满足条件的内容。正式首篇的每个可达终幕状态应展示 1–2 条回响，以及相关主要人物此刻的状态；同人物不能同时命中互相矛盾的去向。示例包可省略。它们由制作者审读，不在梦醒时重新生成。

## 条件和后果

每个选项必需 `id, text, target, effects`，可选 `when`。text 纯文本，≤60 字符。effects 必需三个字段：`resourceDeltas`、`relationshipDeltas`、`setFlags`，可分别为空对象、空对象、空数组。标记首版只允许从 false 置 true；重玩通过回滚恢复。

条件格式 `{all: [predicate, ...]}`，1–8 条；全部成立才可见。predicate 两类：

```json
{"kind":"flag","id":"helped-friend","equals":true}
```

```json
{"kind":"resource","id":"time","op":"gte","value":1}
```

数值 kind 还可为 relationship，op 限 eq/gte/lte。禁止任意表达式、JavaScript、eval 和外部调用。首版没有 OR；需要时增加分支节点，避免引入复杂条件语言。

选项执行顺序：检查确已读完当前节点、当前行动令牌与选项 → 在旧状态评估 when → 计算全部增量 → 检查新数值未越界 → 原子应用增量和标记 → 跳到 target 的首个可见拍 → 保存。越界视为制作错误，不偷偷截断。制作验证须确保**每个可达的选择点状态至少有两个合法选项**；next 与 ending 节点不适用双选项规则。不合法选项不得造成运行死路。

主版本不用随机数。一次选择携带当前节点访问序号与选项 ID，重复点击只结算一次。只有引擎决定是否推进，动画不能触发剧情副作用。

## 最小形状示例

下例用于接口与加载测试，只有一个选择和两个终点，**不是首篇验收内容，也不是已审读梦包**。示例来源文本是“窗外的云慢慢散开，你还有一页没有读完。”（不含引号和末尾换行）；sourceHash 按该文本计算。review=draft，不能通过发布闸门。

```json
{
  "schemaVersion": 1,
  "packageId": "sample-dream",
  "buildId": "sample-dream-v1",
  "title": "一页之间",
  "source": {
    "kind": "original_demo", "title": "机制示例", "author": "项目制作组",
    "workId": null, "completeness": "complete", "trailingFragment": false,
    "sourceHash": "ee3862f1f9623b9273647707d2d8ebcfcd281657291bdc273c31787b1a13e9c0", "paragraphIds": ["p-0001"],
    "sourceUrl": null, "linkStatus": "missing", "rightsRef": "sample-original"
  },
  "review": {"status":"draft","reviewedBuildId":null,"reviewedAt":null,"reviewer":null},
  "theme": "calm", "characters": [], "resources": [], "relationships": [],
  "flags": [{"id":"stayed","label":"留在书屋","kind":"knowledge"}],
  "entryNodeId": "entry",
  "nodes": [
    {
      "id":"entry","kind":"scene","origin":"original","sourceRefs":[],"scene":"BG_GATE",
      "beats":[{"id":"entry-line","kind":"narration","speaker":"narrator","text":"窗外的云慢慢散开，你还有一页没有读完。","anim":"fade"}],
      "choices":[
        {"id":"stay","text":"留下读完这一页","target":"end-stay","effects":{"resourceDeltas":{},"relationshipDeltas":{},"setFlags":["stayed"]}},
        {"id":"leave","text":"合上书，走到晨光里","target":"end-leave","effects":{"resourceDeltas":{},"relationshipDeltas":{},"setFlags":[]}}
      ]
    },
    {
      "id":"end-stay","kind":"ending","origin":"original","sourceRefs":[],"scene":"BG_END",
      "beats":[{"id":"stay-line","kind":"narration","speaker":"narrator","text":"你读完最后一行，把书签留在了这里。","anim":"none"}],
      "ending":{"id":"kept-page","title":"留下的一页","summary":"你为这段阅读留出了时间。"}
    },
    {
      "id":"end-leave","kind":"ending","origin":"original","sourceRefs":[],"scene":"BG_END",
      "beats":[{"id":"leave-line","kind":"narration","speaker":"narrator","text":"你合上书。那一页还在，今天的晨光也还在。","anim":"none"}],
      "ending":{"id":"morning","title":"窗外的晨光","summary":"你带着尚未读完的一页离开。"}
    }
  ]
}
```

## 校验与上限

严格校验未知字段、长度、ID 唯一性、引用与资产存在；后端原始 API 响应可以宽松留档，但发布梦包严格白名单。默认发布 JSON ≤1 MiB、最多 32 节点、每节点最多 20 拍、声明标记最多 32 个；超限必须重新规划内容，而非前端无限接收。

图验证：唯一入口、所有节点可达、无循环、每条路径通向 ending。状态验证从初值执行所有分支，检查条件、数值范围、条件回响和终幕见证路径；不仅检查有没有连线。双击幂等另用引擎行为测试验证，不能声称 JSON 静态检查证明了它。首版最多探索 10,000 个去重后的 `(nodeId, state)` 组合，超出即拒绝并要求简化，不跳过验证。叙事一致性与来源真实性仍需人工。

## 存档与回放

存档版本独立于 schemaVersion：记录 `saveVersion, packageId, buildId, nodeId, beatIndex, phase, revision, resources, relationships, flags, choiceHistory, readBeatKeys, checkpoints, updatedAt`。phase 为 reading/choosing/finished；beatIndex 指向原始 beats 数组中的实际可见拍。revision 为单调增加的行动版本，恢复检查点也产生新 revision，旧点击不能作用到新状态。节点首个可见拍、每次选择后、手动退出时保存；另有拍级节流保存。结局收藏按 packageId/buildId/endingId 去重。

choiceHistory 每项记录 nodeId/choiceId，顺序保留；readBeatKeys 绑定 buildId、此前完整选择路径、nodeId、beatId。checkpoints 保存选择前的完整剧情状态、相应历史和已读集合，不嵌套保存 checkpoints 自身。恢复后移除该分歧点之后的活动检查点，保留独立梦册。

重玩选择前检查点恢复全部剧情状态与已读集合；梦册已解锁收藏保留。读过的拍按 buildId 与实际选择路径判断，不把另一条线的新对白快进掉。动画进度和声音播放头不存档；恢复时显示完整当前拍，重建背景/BGM，不重复播放一次性音效或结算。

恢复演出时从入口按 choiceHistory 重放纯状态和实际可见拍，到当前 beatIndex 为止，只计算背景、最近曲目与静默状态，不播放音效、不写存档、不重复收藏。起始梦内曲默认为 BGM_DREAM；musicCue 可覆盖。BGM 淡化与循环参数属于播放器与资源侧车文件，不写进梦包；梦包只给逻辑曲目。曲目变体（如 `BGM_LONG_C_CALM`、`BGM_DREAM_ALT`）与普通曲目 ID 同等对待，`musicCue.track` 直接引用即可，不提供"随机选一个变体"的语义——换段落是叙事决定。路径与保存数值对不上则提示存档异常并保留备份，不自行编造状态继续。

构建不匹配时保留旧存档，并提供旧包可用时继续、另开新存档、导出备份；不静默迁移或覆盖。没有兼容旧包时说明原因，禁止将其标成可继续。

> 历史资料（2026-09-12 标记）：保留原文供追溯，不作为当前实现或平台能力保证。当前设计见 [文档入口](README.md)、[审查决策](REVIEW_AND_DECISIONS.md) 与 [API 指南](API_GUIDE.md)。旧水墨风格、浏览器存 Key、旧路径和命令均须重新核对。

# 配乐与音效生成 Prompt 包

面向 AI 音乐工具（Suno / Udio / Stable Audio / 天工等）或公开免费音源。

## 一、现有配乐为什么难听

不是混音问题，是**结构问题**。看 `scripts/compose-audio.mjs`：

| 症状 | 代码位置 | 后果 |
|---|---|---|
| 16 个音循环 4 遍，只有第 2 遍升八度 | 第 125–129 行 | 110 秒没有发展，同一句说四遍 |
| 节奏锁在 `beat × 1.5` 的固定网格 | 第 122 行 | 机械，没有散板与呼吸 |
| 力度变化仅 ±11% | 第 130 行 | 每个音一样响，像打点 |
| 4–6 个纯正弦叠加模拟古琴 | 第 87–93 行 | 电子铃声感，不是弦声 |
| 单声道 + 延迟代替混响 | 第 124、150 行 | 回声感，没有空间 |
| 颤音固定 4.3 Hz 正弦调制 | 第 108 行 | 笛声呆板 |

**换音源时重点不是"音色更高级"，而是要有人性化和发展。** 下面每首 prompt 都写死了这两条要求。

### 实测到的音量不一致

从 `public/audio/manifest.json` 读出的六首实际参数：

| id | 曲名 | 时长 | 速度 | 峰值 | RMS |
|---|---|---|---|---|---|
| `inn` | 黄粱未熟 | 110s | 56 | −8.84 dB | −24.77 dB |
| `official` | 长安有序 | 92s | 68 | −8.16 dB | −23.18 dB |
| `village` | 灯下春深 | 100s | 62 | −9.08 dB | −24.20 dB |
| `travel` | 江流有信 | 85s | 74 | −7.99 dB | −22.89 dB |
| `intimate` | 未寄之书 | 118s | 52 | −9.10 dB | −26.38 dB |
| `return` | 一枕空山 | 133s | 46 | **−12.62 dB** | **−33.63 dB** |

前五首的 RMS 挤在 −23 到 −26 dB 之间，**`return` 是 −33.63 dB，比其它低了约 9 dB**——终幕切换过去时音乐会像"掉下去了"，而这恰好是全游戏情绪最重的一刻。重新生成后必须做一次响度对齐，全部拉到 −24 dB 附近再入包。

另外 `travel` 只有 85 秒，低于下面定的 90 秒下限，重做时一并补足。

## 二、全局技术规格（每首都必须满足）

- **时长 ≥ 90 秒，必须可无缝循环**：结尾回到开头的动机与和声，首尾能直接对接。
- **无人声**。有人声会盖住旁白朗读。
- **无打击乐、无鼓组、无强拍**。这类游戏听几十遍，任何节奏钩子都会变成折磨。
- **动态范围要小**。目标 RMS ≈ −24 dB、峰值 ≈ −8 dB。配乐是背景，不能忽大忽小。
- **旋律不要抓耳**。记忆点强的旋律三次之后开始烦。
- **结尾不要"解决"**。终止感太强会打断连续游玩，留一个悬置。

**通用排除项（Suno 的 Exclude Styles / 负向提示都填这段）：**

> vocals, singing, choir, drums, percussion, beat, EDM, synthwave, piano, orchestral strings, cinematic build, epic, dramatic climax, reverb wash, heavy bass

## 三、六首曲子的完整 Prompt

每首给三段：**Suno 风格标签**（填 Style 栏）、**中文描述**（可灵/即梦等中文工具直接用）、**英文描述**（Suno/Udio 的 Description 或歌词框内的 `[Instrumental]` 说明）。

---

### 1. `inn` 黄粱未熟 — 客栈、开场、梦始

**风格标签：**
```
traditional chinese, guqin, xiao flute, solo instrumental, pentatonic, sparse, meditative, rubato, 56 bpm, no percussion, loop
```

**中文描述：**
> 中国传统五声调式，箫独奏为主，古琴偶尔点音相和。速度约 56 BPM，散板自由，不守节拍。空寂疏朗，像清晨无人的山中客栈，晨雾未散。主题动机在此第一次完整呈现，要成为整套配乐的记忆种子。情绪克制，音符之间留大段沉默。无人声、无打击乐、无渐强高潮、无终止感。

**英文描述：**
> Chinese pentatonic. Solo xiao (bamboo flute) carrying the melody with occasional single guqin notes answering. Around 56 BPM, free rubato, deliberately unquantized. Desolate and airy, like an empty mountain inn at dawn before the mist lifts. This is the first full statement of the main theme that the whole soundtrack will vary. Restrained; long silences between phrases. Instrumental only. No percussion, no build, no resolution.

---

### 2. `official` 长安有序 — 入世、仕途、朝堂

**风格标签：**
```
traditional chinese, guzheng, pipa, pentatonic, measured, restrained, 68 bpm, no percussion, instrumental loop
```

**中文描述：**
> 筝与琵琶交替应答，速度约 68 BPM，节奏比其它几首略规整，但仍带呼吸感。克制的行进感——秩序之下有暗流，不是喜庆也不是威严，是身在体制里的谨慎。中等密度，不要热闹。无人声、无打击乐、无锣鼓、无宫廷华彩。

**英文描述：**
> Chinese pentatonic. Guzheng and pipa trading phrases in call and response, around 68 BPM — steadier than the other cues but still breathing. A restrained sense of procession: order with an undercurrent, neither celebratory nor majestic, but the caution of someone inside a system. Medium density, never busy. Instrumental only. No percussion, no gongs, no court fanfare.

---

### 3. `village` 灯下春深 — 留乡、工坊、安稳

**风格标签：**
```
traditional chinese, guqin solo, pentatonic, warm, domestic, intimate, 62 bpm, sparse, instrumental loop
```

**中文描述：**
> 古琴主奏，音色温润，速度约 62 BPM。有烟火气但不热闹，像深夜灯下做手工活——屋里有人，但安静。旋律比其它几首稍暖、稍多起伏，是整套配乐里最"安心"的一首。无人声、无打击乐、无欢快跳跃。

**英文描述：**
> Chinese pentatonic. Solo guqin, warm timbre, around 62 BPM. Domestic but not lively — like working by lamplight late at night. Someone is home, yet it is quiet. Slightly warmer and more melodic than the other cues; this is the most reassuring piece in the set. Instrumental only. No percussion, nothing jaunty.

---

### 4. `travel` 江流有信 — 远行、江行、商路

**风格标签：**
```
traditional chinese, pipa tremolo, xiao flute, pentatonic, flowing, open, 74 bpm, instrumental loop
```

**中文描述：**
> 琵琶轮指与箫对答，速度约 74 BPM，流动性明显强于其它几首。开阔但不激昂——水面的起伏来自旋律线本身，不靠配器堆叠。像顺江而下，两岸青山缓缓退去。无人声、无打击乐、无激昂上扬。

**英文描述：**
> Chinese pentatonic. Pipa tremolo figures answered by xiao. Around 74 BPM, clearly more flowing than the other cues. Open without being rousing — the sense of water comes from the melodic contour itself, not from layering. Like travelling downstream as the green hills slide past. Instrumental only. No percussion, no swell into excitement.

---

### 5. `intimate` 未寄之书 — 关系关键场景

**风格标签：**
```
traditional chinese, solo guqin, pentatonic, extremely sparse, long tones, rubato, 52 bpm, ambient, instrumental
```

**中文描述：**
> 极简到近乎静止：单件乐器（古琴或箫，二选一），整首音符很少，大量长音与留白。私密、贴近、不煽情。这一首在剧情里承担特殊功能——它负责"撤去音乐"的对比，所以音量要特别低，存在感要弱到玩家几乎注意不到。无人声、无和声堆叠、无情绪推进。

**英文描述：**
> Chinese pentatonic, radically minimal. A single instrument — either solo guqin or solo xiao, pick one — with very few notes across the whole piece, long tones and long silences. Private and close, never sentimental. This cue has a structural job: it must be quiet enough that the player barely registers it, so that its absence in silent scenes reads as absence. Instrumental only. No layering, no harmonic build, no emotional arc.

---

### 6. `return` 一枕空山 — 回归、终幕、晚年

**风格标签：**
```
traditional chinese, guqin, xiao, pentatonic, slow, sparse, elegiac, resolved, 46 bpm, instrumental
```

**中文描述：**
> 全套配乐中最慢的一首，约 46 BPM。主题动机的最后一次变奏——玩家会认出这个旋律，但节奏更慢、音符更少。稀疏、苍老、释然。**不要悲伤收尾**，是走完一生之后回望的平静，不是哀悼。这一首决定玩家对整局游戏的最后印象，值得单独多生成几版挑选。无人声、无高潮、无弦乐渐强。

**英文描述：**
> Chinese pentatonic. The slowest cue in the set, around 46 BPM. The final variation of the main theme — the player should recognise the melody, but slower and sparser. Weathered, sparse, at peace. Crucially, this must **not** end in sorrow: it is the calm of looking back after a whole life, not mourning. Instrumental only. No climax, no swelling strings.

---

## 四、主题分段与改名

生成时按"情绪家族"分三段走，同一段里的两首共享配器与织体，做起来容易统一：

| 段 | 曲目 | 共性 |
|---|---|---|
| 段一｜栖居 | `inn`、`village` | 静、室内、守在一个地方；古琴与箫为主 |
| 段二｜行走 | `official`、`travel` | 有行进感；筝与琵琶为主，节奏略密 |
| 段三｜内与终 | `intimate`、`return` | 极简、私密、收束；单件乐器 |

**但生成顺序要倒过来**：先做 `inn` 和 `return` 各一版，它们定义主题动机的首尾形态；中间四首都是从这条动机变奏出来的。这两首没定，中间四首做了也要返工。

### 建议改名

现在的曲名是枕中记专有的，换任何故事都对不上：

| id | 现名 | 建议 | 理由 |
|---|---|---|---|
| `inn` | 黄粱未熟 | **逆旅** | "黄粱未熟"直接指向黄粱梦典故 |
| `official` | 长安有序 | **入世** | "长安"绑定具体朝代与地点 |
| `village` | 灯下春深 | **安居** | 尚可，但"春深"限定了季节 |
| `travel` | 江流有信 | **远行** | "有信"是枕中记里商路线的专属说法 |
| `intimate` | 未寄之书 | **相对** | "书"指向信件，别的故事未必有 |
| `return` | 一枕空山 | **归处** | "一枕"是本作专有词，不能复用 |

改完要同步 `src/game/audio.ts` 的 `trackNames` 和 `public/audio/manifest.json` 的 `title`。

## 五、题材覆盖的边界

和背景图同一个问题：**这六首是五声古琴体系，只服务"古代中国人生"这一类故事。**

知乎比赛列表里实测的 20 篇是惊悚、脑洞、无限流、甜宠、爽文、现代——一篇古风都没有。玩家导入这类内容时，这六首全都不对味。

处理方式和背景图一致，三条路选一条：

1. **限定题材**——只接受古风/历史/武侠内容。最省事，调性最统一。
2. **转译框架**——任何故事都转译成"古代中国的一场人生"。符合"枕中千生"设定，素材量不增加。
3. **多套资产**——再加一套悬疑/惊悚配乐（不协和音程、低频嗡鸣、稀疏打击）和一套现代都市配乐。覆盖最广，工作量翻倍。

**无论选哪条，建议先补一首"通用悬念"曲**：不带明确时代感，用低音持续音加不协和音程，让惊悚/悬疑类故事至少有东西可用，不必等整套做完。

1. **一定要用 Custom Mode + `[Instrumental]`**，否则会给你配上中文人声，直接废掉。
2. **无缝循环不好一次生成到位**。实测做法是生成 2–3 版，挑首尾调性一致的，再用 Audacity 手动接：结尾留 1 秒淡出、开头留 1 秒淡入，中间交叉。
3. **加长用 Extend，不要用"重生成"**。重生成会换掉动机，六首就串不成一套了。
4. **先做 `inn` 和 `return`**。这两首定义了主题的首尾形态，剩下的都是从它变奏。这两首定不下来，别急着做中间四首。
5. **生成的曲子通常太"满"**。Suno 默认会加弦乐和混响，记得把排除项填全。出来还是满就降风格权重再说一次"sparser"。

## 六、音效清单

项目目前**没有音效素材文件**，环境声由 `AudioContext` 现场合成。建议补齐（one-shot，0.2–3 秒）：

| 用途 | 时长 | 生成提示 |
|---|---|---|
| 翻页 / 文字推进 | 0.2s | 宣纸翻动，干脆轻微，不要长尾沙沙声 |
| 关键词点染 | 0.6s | 一滴墨落纸，轻微扩散，带一点回响 |
| 雨（循环） | 20s+ | 屋檐滴雨与细密雨声，无雷 |
| 江流（循环） | 20s+ | 缓慢流水与轻拍岸，低频为主 |
| 市集远景（循环） | 20s+ | 极远处人声嘈杂，听不清内容，音量极低 |
| 更漏 / 远钟 | 3s | 铜壶滴漏或远寺钟，单次，长尾 |
| 门轴 | 1s | 木门开合，干涩，不要恐怖化 |
| 脚步 | 1s | 石阶与雪地各一版，轻、短 |
| 刨木 | 1.5s | 木工刨花，工坊用 |

循环类首尾必须能接，剪辑时前后各留 0.5 秒淡入淡出兜底。

## 七、免费音源

**每个文件单独核对许可**，同一站点内不同文件许可可能不同。

| 来源 | 内容 | 许可 | 注意 |
|---|---|---|---|
| [Pixabay](https://pixabay.com/) | 音乐 + 音效 | Pixabay License | 免费商用免署名，但不能把素材本身再分发 |
| [Freesound](https://freesound.org/) | 音效 | CC0 / CC-BY 混合 | 逐个看，CC-BY 必须署名 |
| [Musopen](https://musopen.org/) | 古典录音 | 公有领域 / CC | 找真实乐器录音 |
| [Free Music Archive](https://freemusicarchive.org/) | 音乐 | CC 系列 | 注意 CC-BY-NC，**NC 不能商用** |
| [Openverse](https://openverse.org/) | 聚合搜索 | 跟随原站 | 一次搜多个 CC 源 |
| [Incompetech](https://incompetech.com/) | 音乐 | CC-BY | 必须署名 Kevin MacLeod |

**关于古风音乐的实话：** 这些站里高质量的中国传统器乐免费素材很少。国内流传的"免费古风"多是转载，许可来源不明，风险高。三条现实路径：AI 生成（各家服务条款对商用与所有权规定不同，需自行确认）、修现有合成代码、或购买授权曲库。**不建议**用来路不明的转载音源。

## 八、另一条路：修合成代码

如果你更想保住"原创"这个属性，现有合成器的六个问题都是可以修的，而且改动量不大：

- **加乐句变化**：现在 4 遍完全重复，改成 4 段各有变奏（加花、减音、转位）。
- **打散网格**：在 `step` 上加 ±30ms 的随机微偏移，力度范围从 ±11% 扩到 ±40%，并按乐句位置做渐强渐弱。
- **换弦模型**：纯正弦换成 Karplus-Strong（延迟线 + 低通反馈），成本很低但弦感立刻真实。
- **立体声 + 卷积混响**：把 `mono` 改成双声道，用一段生成的白噪声脉冲响应做卷积，替代现在的延迟。

这条路的优势是没有版权问题、文件小、可复现，而且和项目现在"音乐是本项目原创乐谱与合成音色"的声明一致。要不要做，你定。

## 九、接入与署名

换音源后必须同步三处：

1. `public/audio/manifest.json` —— 现有条目写的是"本项目原创乐谱与合成音色，无外部采样"。换成 AI 生成就写模型名与生成日期；换成免费音源就写原始链接、作者与具体许可（CC0 / CC-BY / CC-BY-NC），**不能**再声称原创。
2. 游戏内素材来源页 —— CC-BY 与 CC-BY-NC 素材**必须**署名，漏了就是许可违规。
3. README"声音与美术"一节 —— 现有表述"音乐是本项目原创乐谱与离线合成音色……不是古琴／琵琶／箫的真人实录"，改用真人录音后要改。

**商用与 NC：** 参赛或非商业发布时 CC-BY-NC 尚可用；一旦涉及商业化，NC 素材必须全部替换。选素材时优先 CC0 与 Pixabay，可以把后面这条麻烦整个绕开。

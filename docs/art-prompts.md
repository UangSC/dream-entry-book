> 历史资料（2026-09-12 标记）：保留原文供追溯，不作为当前实现或平台能力保证。当前设计见 [文档入口](README.md)、[审查决策](REVIEW_AND_DECISIONS.md) 与 [API 指南](API_GUIDE.md)。旧水墨风格、浏览器存 Key、旧路径和命令均须重新核对。

# 场景背景生成 Prompt 包（主题分批）

面向 AI 绘图工具。**按批次生成**——每一批是一个主题组，三张图共享同一套视觉处理，一批生成完再做下一批，容易保持统一。

## 使用方式

1. **每批都要带上下面的"全局风格前缀"**，它保证 12 张看起来像同一批画。
2. **一批三张连着生成**，不要跳着做。同一批里的三张是互为参照的，一起做才像一套。
3. 每批末尾有"验收要点"，过不了就先调前缀，别往下走。

## 全局风格前缀（每张都带）

**中文：**

> 宋元山水画风格，绢本设色，淡墨渲染，平远构图，大量留白；青绿与浅绛并用，色调低饱和、灰调偏冷；笔触松秀含蓄，不描细节；画面无人物、无面部、无文字、无印章、无水印；整体明度偏亮、对比度低，中下部留出安静空间；横向宽幅。

**English:**

> Song-Yuan dynasty Chinese landscape painting, ink and color on silk, pale ink washes, flat-distance composition, extensive negative space; mineral green and pale ochre, desaturated cool grey tonality; loose restrained brushwork, no fine detail; no figures, no faces, no text, no seal, no watermark; high key, low contrast, calm empty lower-middle area; wide horizontal format.

**四条硬性技术约束：**

- **不要人物。** 角色由游戏内剪影立绘叠加，背景里有人会重影。
- **不要高对比、不要强透视焦点。** 背景上要压一层色雾再叠立绘，太抢的画面盖不住。
- **中下部必须安静。** 立绘站在这里。
- **横向宽幅，16:9 或 3:2，宽度 ≥ 2400px。**

---

# 批次 A｜行旅与自然

**本批共性：** 开阔、人小、天大地大，是"人在路上"的三张。构图上地平线偏低，上方大量留白与云气。

### A1 `inn` 客栈、旅次
> 山间驿站一角，茅檐低垂，远处一面酒旗，门前石阶湿冷，晨雾未散。
>
> A mountain waystation corner, low thatched eaves, a distant tavern banner, damp stone steps, morning mist.

### A2 `crossroads` 岔路、抉择
> 三岔路口，一条向北入山，一条沿河向东，一条没入麦田，路旁半埋的路碑。
>
> A three-way fork: one path north into hills, one east along a river, one into wheat fields, a half-buried milestone.

### A3 `voyage` 江行、远舟
> 江面开阔，两岸青山退去，帆影稀疏，水天一色。
>
> A wide river, receding green hills on both banks, sparse sails, water merging into sky.

**验收要点：** 三张的天际线高度是否接近；是否有任何一张出现了清晰的人形或船夫。

---

# 批次 B｜水与生计

**本批共性：** 劳动的痕迹——堤坝、栈桥、工具，但没有人。纹理比 A 批密，仍要保持低对比。

### B1 `river` 治水、河工
> 大河堤岸，浊浪与沙洲，远处捆扎的柴埽与木桩，天低云重。
>
> A great river embankment, turbid waves and sandbars, distant bundled brushwood and stakes, low heavy clouds.

### B2 `harbor` 港口、市舶
> 江口码头，桅杆林立，栈桥与货担，水面浮着油光。
>
> A river-mouth wharf, a forest of masts, piers and carrying poles, oily sheen on the water.

### B3 `workshop` 工坊、学艺
> 作坊内部，木架与工具挂满墙面，刨花落地，天窗漏下一道光。
>
> A workshop interior, walls hung with timber frames and tools, wood shavings on the floor, one shaft of light from a skylight.

**验收要点：** B3 是室内，和 B1/B2 的户外感要拉开但不能像别的画风；天窗那道光不要过曝。

---

# 批次 C｜居所与静好

**本批共性：** 有人住过的痕迹——灯、帘、案、石，但安静。三张是全套里最暖的一组，色温可比其它批略高一点。

### C1 `home` 家中、内室
> 庭院回廊，竹帘半卷，案上一盏灯，窗外树影，室内幽暗温暖。
>
> A courtyard veranda, half-rolled bamboo blind, a single lamp on a desk, tree shadows beyond the window.

### C2 `garden` 庭院、静好
> 私家园林，太湖石与曲径，池面浮萍，花枝斜出墙头。
>
> A private garden, taihu stones and a winding path, duckweed on the pond, flowering branches over a wall.

### C3 `capital` 京城、长安
> 城郭远眺，坊墙层叠，飞檐与街市轮廓，薄雾压住喧嚣。
>
> Distant city walls, layered ward walls, upturned eaves and market rooftops, thin haze muting the noise.

**验收要点：** 这三张最容易画成"喜庆"，要压住——不能有红灯笼成排、不能有节庆气氛。C3 要"远看"不要"热闹"。

---

# 批次 D｜权力与困厄

**本批共性：** 压迫感。三张是全套里最暗的一组，但仍要守住"低对比"，不能靠压黑来做沉重。

### D1 `court` 朝堂、官署
> 殿庑深廊，朱柱成列，帷幕低垂，地面反光，空旷而压抑。
>
> A deep palace colonnade, rows of vermilion pillars, low-hanging drapes, reflecting floor, vast and oppressive.

### D2 `exile` 贬谪、荒徼
> 荒寒山道，枯木与断碑，远处瘴雾，人迹罕至。
>
> A bleak mountain road, dead trees and a broken stele, miasmic mist beyond, no trace of people.

### D3 `prison` 狱中、困厄
> 石室一角，铁栅投影在地，高处一个小窗透光。
>
> A stone cell corner, iron bars casting shadows on the floor, light from a small high window.

**验收要点：** 这三张最容易画"脏"和"过暗"。生成后调亮到和白天的图一个明度区间，沉重感靠构图（空、深、封闭）而不是靠暗。

---

## 生成顺序

**先做批次 A**。A 的三张差异最大（室内感的客栈 / 三岔路 / 开阔江面），如果它们看起来像同一批画，说明前缀调对了，剩下三批照着走即可；如果不像，先改前缀，别往下做。

## 复用边界（重要）

这 12 张覆盖的是**"一个古代中国人生"会遇到的全部场景**。它能复用的前提是——**导入的故事被转译进这个世界**。

但这里有个必须正视的问题：知乎比赛列表里我实测的 20 篇是**惊悚、脑洞、无限流、甜宠、爽文、现代**，一篇古风都没有。如果玩家导入一篇"近视眼勇闯恐怖游戏"，这 12 张一张都用不上，六首五声古琴配乐也全都不对。

三条路，你选一条：

1. **限定题材**：导入功能只接受古风/历史/武侠类内容，其余提示"此文不适合入梦"。最简单，游戏调性最统一。
2. **转译框架**：任何故事都转译成"古代中国的一场人生"——恐怖游戏变成"入山遇祟"，无限流变成"数世轮回"。符合"一枕千生"的设定，但需要 AI 改写幅度大，且要接受离原作很远。
3. **多套资产**：再准备一套现代/都市场景 + 一套悬疑/惊悚场景，按文章类型切换。工作量最大（每套再 12 张图 + 6 首曲），但覆盖最广。

我建议 **2**，因为它和游戏"枕中一梦即是一生"的核心设定自洽，而且不用成倍增加素材。1 最省事但砍掉了大部分知乎内容。3 最完整但你现在的素材量已经不小了。

## 接入方式

1. 转 WebP 放进 `public/art/`。
2. 更新 `public/art/manifest.json`——**每张记录真实来源**。现有条目写的是 "CC0 / The Metropolitan Museum of Art Open Access"，AI 生成的必须改成模型名、生成日期和你的授权说明，**不能**沿用公版画的说法。
3. 改 `src/components/InkScene.tsx` 的 `sceneArt` 映射，让 12 个场景各指向自己的文件，取消复用。当前复用情况：`clouds` 同时当客栈/岔路/江行，`garden` 同时当家中/朝堂/工坊，`pines` 同时当贬谪/狱中——玩家在三个完全不同的处境看到同一张图，是最出戏的地方。

## 版权与出处

AI 生成图的版权状态因工具而异。请在 manifest 里如实标注"AI 生成"，不要写成公版画作。游戏内"故事缘起"页面目前声明背景取自 The Met 公版古画，换图后这段文字要同步改。

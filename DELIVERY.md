# 《吃人心的小妖怪》完整版交接

## 运行

```bash
npm install
npm run build
npm run preview
```

浏览器打开 http://127.0.0.1:62560/ 。

## 方案取舍

以 GPT6 方案的章节节奏和照护主题为主骨架，吸收 DeepSeek 的市井冲突、GLM5.3 的雨夜与送别桥段。临时采用单线共同主干加两结局，确保网页选择、自动存档和回望系统稳定。

## 资源

`new_BG` 已转入 `assets/source/art`、`public/art`；音频原件位于 `assets/source/audio/bgm-new` 与 `sfx-new`，公共可替换文件位于 `public/audio`。背景 ID、音乐 ID 均集中在 `tools/prepare-story.ts`，替换同名文件即可。新增背景用于雨夜、山涧、张家场景；新增 BGM 原件作为后续换皮素材保留，当前演出映射到已校验长曲；音效原件保留并沿用现有翻页、选择、梦门音效。

## 剧情与交互

共 10 节点、2 个结局、193 拍，正文约 7,800 字（构建脚本生成并校验）。关键选择为火边的“拨旺火/先谈报酬”、山下的“坦诚/逞强”、结尾的“留下/明日再来”；选择会写入 flags 并在结局回响。节点使用场景切换、音乐 cue、打字机与粒子效果。

## 入梦包

完整版：`public/books/little-demon.dreambook`。Demo 样例：`public/books/little-demon-demo.dreambook`（构建前备份，二者共存）。书架导入时分别选择对应文件即可。

## 待决策

1. 新 BGM 是否在下一轮换成原件直出：当前为体积受控的既有长曲映射；备选是启用 6 首 WAV 并扩大入梦包限制。
2. 表情立绘接入方式：当前引擎保持向后兼容，使用既有说话者渲染；备选是增加 portrait 字段和聊天头像层。
3. 章节标题与结局文案：当前采用治愈向临时稿；备选是按原著审读意见调整。

## 主要改动

`tools/prepare-story.ts`、`public/art/manifest.json`、`public/audio/manifest.json`、新增背景与音频目录、`public/books/little-demon-demo.dreambook`、本文件。

## 验证

`npm run build` 与 `npm run check:release` 已通过；`npm run test:offline` 已通过。现有 `playable.test.ts` 的旧长度上限针对 Demo，完整版扩充后会超出该历史断言，需下一轮更新测试口径。

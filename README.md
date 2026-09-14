# 入梦书

阿里云后端上传包与层的配置方法见 [FC 部署说明](docs/FC_DEPLOYMENT.md)。
本地官方工具安装与验收见 [知乎 Hackathon Skill 接入记录](docs/HACKATHON_SKILL_SETUP.md)。

读过的故事，值得一活。Vite + React + TypeScript 互动小说，FastAPI + SQLite 提供授权码登录与最近七天的手记。

《吃人心的小妖怪》现使用 `content/final/` 的正式定稿：三线、12 个选择点、45 节点、951 拍、7 个终幕（梦册合并同名文本后 6 项）。已复用原有资源管线、立绘、沉浸阅读、自动播放、情绪选择动画及离线缓存。

## 本地启动

需要 Node.js 22.12+ 或 24、Python 3.11+。在项目根目录打开两个终端。

前端：

```powershell
npm install
npm run build
npm run preview
```

后端：

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r backend/requirements.txt
.venv\Scripts\python -m uvicorn backend.app:app --host 127.0.0.1 --port 62561
```

访问 [http://127.0.0.1:62560/](http://127.0.0.1:62560/)。Vite 将 `/api` 转发到 62561。开发前端可用 `npm run dev -- --host 127.0.0.1 --port 62560 --strictPort`，先停止占用该端口的 preview。

默认为本地模拟授权：右上角“知乎登录”→填写模拟昵称→同意并返回。无需知乎密码。点击头像查看游玩记录、异步织梦任务、入架记录；打开面板暂停配乐。“制作流程演示”仍复用小妖怪定稿；“知乎直答 · 入梦线索分析”真实调用知乎，生成可回看的分析报告，不冒充完整可玩游戏。

“新增入梦书”弹窗已接入官方故事目录、详情及知乎搜索；挑选故事后可建立线索分析任务。Access Secret 只在服务端读取：Windows 可运行 `.venv\Scripts\python -m backend.credentials` 保存到当前用户凭据库，部署环境使用 `ZHIHU_ACCESS_SECRET`。详见 [API 接入与额度说明](docs/submission/API_INTEGRATION.md)。[项目申报填写稿](docs/submission/PROJECT_FORM.md) 包含计划书及封面、ICON 提示词。

后端配置与真实知乎接入边界见 [backend/README.md](backend/README.md)。完整交付、字数核验、资源占位与待决策项见 [DELIVERY.md](DELIVERY.md)。

## 游玩与旧书

- 箭头、正文、空格或右方向键翻页；左箭头或键盘左方向键回退。最多保留 30 条对话记录，回退后右箭头优先前进到已读内容，重选会清除旧路线的前进队列。自动播放在选择处停止，设置中可调语速；背景过场期间不接受翻页或选择。
- 对话框按屏幕高度保持固定阅读区，长文字在框内滚动；后退、播放和继续 SVG 为右下角的小图标，无按钮底色。网页禁用右键菜单、非输入区选中与复制，输入框保留正常编辑和粘贴。
- 首次入梦前，人物姓名和简短介绍以毛玻璃模糊效果展示，采用紧凑两列排布；开始游玩后可查看人物信息。
- 设置 → 旁白显示：立绘渐变保留最近角色并在旁白时缩小、变白；文本旁白改用独立的大字“旁白”，角色立绘直接切换，无图角色显示大字姓名。内心独白使用括号及主人公对应立绘，不算旁白。
- 阅读框下“存档”或设置中可打开两个存档位：自动档在到达选择时保存选择前最后一句，下个选择覆盖；手动档由玩家点击保存覆盖。两者均包含对话队列，读取会恢复剧情条件，不会重复结算选择。自动档读取后点继续才显示选项。退出时仍保留最近阅读位置，不覆盖这两个存档位。
- 首次进入可选择“是，开启声音”或“暂时静音”，浏览器保存选择。刷新后浏览器可能仍要求点击“推开梦门”才能播放，可随时用声音按钮切换。
- 章节文字消散持续 5 秒；LOGO 延后消散，持续约 5 秒，粒子数量和扩散范围已增加。系统开启减少动态效果时保留简化效果。
- 分歧回望可重选已走过的分叉，已收藏梦签保留。书签仍保存在当前设备和地址，可从设置导出备份。
- 正式版：[little-demon.dreambook](public/books/little-demon.dreambook)。旧样例：[little-demon-demo.dreambook](public/books/little-demon-demo.dreambook)。临时单线存档兼容包：[little-demon-legacy.dreambook](public/books/little-demon-legacy.dreambook)，需要时从书架导入。
- 在线缓存完成显示“离线就绪”后，阅读可离线使用。登录与后端任务需要本地服务在线；授权和账号 API 不进入离线缓存。
- 上一轮已检查桌面和 390 × 844 窄屏阅读框。本轮新增功能完成组件交互及逻辑验证；浏览器控制连接失败，新样式尚待实际浏览器视觉复核。

## 检查与制作

```powershell
npm test
npx tsx tools/verify-final-story.ts
npm run check:release
npm run test:offline
.venv\Scripts\python -m pytest backend/test_app.py -q
```

构建自动运行 `tools/prepare-story.ts` 与 `tools/prepare-book.ts`。定稿快照和原件哈希位于 `content/final/`，逐行导入审计及 192 条路径报告也在该目录。`tools/prepare-final-assets.py` 加工本轮音画，`tools/story-performances.ts` 编排表情和服装，不改正文。

`dist/` 为静态前端发布产物。推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会自动构建并发布到 GitHub Pages，预计地址为 `https://UangSC.github.io/dream-entry-book/`。GitHub Pages 只承载前端和浏览器本地存档；知乎登录、搜索、直答及其他 `/api` 功能需要单独的后端服务，不能把密钥放进 Pages。

Pages 构建读取 Actions 公开变量 `VITE_API_BASE_URL`（FC 的 HTTPS 域名，不带路径）。真实登录由前端跳转知乎，登记回调为 `https://uangsc.github.io/dream-entry-book/oauth-callback.html`；FC 通过 JSON 兑换授权码，密钥与知乎令牌留在后端。应用短期会话保存在当前标签页，不依赖第三方 Cookie。首次切换此方案必须同步发布前端、更新 FC 代码并修改知乎回调，详细配置与通过标准见 [FC 部署说明](docs/FC_DEPLOYMENT.md)。

工作流未配置 `VITE_API_BASE_URL` 时，默认连接 `https://rumengshu-igadxpnchf.cn-hangzhou.fcapp.run`；该公开变量可覆盖默认值，禁止填入密钥。

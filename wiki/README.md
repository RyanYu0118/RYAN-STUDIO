# 流浪世界 Wiki（RYAN-STUDIO / `wiki/`）

## 唯一真相源：本仓库（RYAN-STUDIO）

**以 [RYAN-STUDIO](https://github.com/RyanYu0118/RYAN-STUDIO) 根目录下的 `wiki/` 为准**编辑、评审与版本历史；Minecraft `1.21.11` 服务器目录**不再**存放 Wiki 源文件（见该仓 `WIKI.md`）。Halo 为**发布目标**（渲染 + 附件 `/upload/`），不要在后台改完再反向覆盖 Git（除非刻意做一次性导出备份到 `demo/`）。

| 步骤 | 命令 / 位置 |
|------|-------------|
| 改内容 | 编辑 `wiki/**/*.md`、共享组件 `wiki/_halo/*` |
| 本地看效果 | `wiki/预览Halo页.ps1`（默认 `home.md`）→ `wiki/_preview/*.html` |
| 贴到 Halo | `wiki/发布到Halo.ps1` → `wiki/_publish/*.halo-paste.md`（已展开 CSS/JS） |
| **一键推到 Halo（API）** | 配置 `wiki/.halo.env` 后 `wiki/推送到Halo.ps1 -File player/...md -Publish -RewriteUpload` |
| **整篇 JSON 导入** | `wiki/导出Halo文章JSON.ps1` → `wiki/demo/*.halo-import.json`（与 `demo/流浪世界服务器Wiki.json` 同结构） |
| 线上附件 | 图片需在 Halo 上传为 `/upload/...`；Git 内可用 `demo/upload/` 预览，发布时加 `-RewriteUpload` |

导入 RYAN STUDIO 时，建议按目录上传；各文件头部的 `slug` 与路径一致，便于在站内还原层级。

## 目录结构


```
wiki/
├── home.md                 # 全站首页（玩家 / 开发者两个入口）
├── demo/                   # 平台导出样例（含 HTML/CSS/JS 块，勿直接当站内首页）
│   └── 流浪世界服务器Wiki.md
├── player/                 # 玩家向
│   ├── index.md            # 玩家 Wiki 首页
│   ├── getting-started.md
│   ├── rules.md
│   ├── commands.md
│   ├── economy.md
│   ├── map-teleport.md
│   ├── server-world/       # 服务器世界（勿用 world/，会被 .gitignore 忽略）
│   ├── world-building/     # 世界观（社会科学 / 自然科学双卡入口）
│   └── community/          # 项目与日记
└── developer/              # 开发者 / 运维向
    ├── index.md
    ├── guide.md
    ├── wiki-contributing.md
    ├── resources/          # 推荐与在用的资源
    └── planning/           # 长期规划、软硬件
```

## Slug 约定

| 文件 | slug |
|------|------|
| `home.md` | `home` |
| `player/index.md` | `player` |
| `player/getting-started.md` | `player/getting-started` |
| `developer/index.md` | `developer` |
| … | 与相对路径相同，去掉 `.md` |

站内链接若不支持相对路径，导入后把正文中的 `(getting-started.md)` 改为平台要求的 `(player/getting-started)` 即可。

## 自定义 HTML 页面（`demo/`）

RYAN STUDIO / 站内编辑器支持**特殊块**：在 Markdown 中插入 UUID 行 + 原始 **CSS**、**HTML**、**`(function(){ ... })();` 脚本**（见 `demo/流浪世界服务器Wiki.md`）。可做出导航条、全息卡片、懒加载视频、深浅色适配等与纯 Markdown 无关的版式。

- **用途**：首页横幅、专题落地页、复杂交互组件。
- **注意**：脚本与样式仅在 Wiki 平台开启「原始 HTML」或对应块类型时生效；本仓库 Markdown 在 GitHub 预览里**不会**执行这些块。
- 维护：`demo/` 仅作 **Halo 历史导出备份**；**站内首页与 player/developer 索引** 在 Git 中用 `{{MCWWS_HALO_CSS}}` / `{{MCWWS_HALO_JS}}` + `wiki/_halo/`（见 `home.md`），发布用 `发布到Halo.ps1`

## 为什么在 Cursor 里「读」不出 Halo 效果？

Halo / RYAN STUDIO 的 **Markdown·HTML 混合块**（见 [Halo Markdown/HTML 内容块插件](https://www.halo.run/store/apps/app-NgHnY)）在存盘时往往是：

- 单独一行的 **UUID**（编辑器块 ID，不是正文）
- **未包在 \`\`\` 代码围栏里** 的 CSS、HTML、`<script>` / IIFE 脚本
- 站内由主题 + 插件渲染；**不是** GitHub 式标准 Markdown

因此 Cursor / VS Code 会出现：

| 现象 | 原因 |
|------|------|
| **预览** 只有乱糟糟的文字、无卡片/视频 | 内置预览只认 CommonMark/GFM，**不会**执行脚本、也不会应用裸 CSS |
| **编辑器** 一大坨单行 CSS，难以阅读 | 语法高亮仍按 `.md` 解析，块边界与 Halo 不一致 |
| **AI 对话** 若说「读不懂页面」 | 文件其实是纯文本，能读内容，但**无法从仓库还原站内排版**（缺 Halo 运行时） |

这不是文件损坏，而是 **渲染环境不同**。

### 在 Cursor 里怎么弄（推荐）

1. **日常文档**（规则、经济、命令）：只改 `wiki/player/`、`wiki/developer/` 等**标准 Markdown**（带 `slug` 头），在 Cursor 里预览、diff、给 AI 看都正常。
2. **复杂首页 / 专题**：在 Git 改 `home.md` 等 + `wiki/_halo/`；运行 `预览Halo页.ps1` / `发布到Halo.ps1`；`demo/` 只存旧版 Halo 导出对照。
3. **可选**：`wiki/demo/**` 可按 **HTML** 高亮便于读导出；**不要**在 demo 与 home 两套并行改同一页。

**要看最终网页**：本地用 `_preview` HTML；线上以 Halo 发布后为准（发布前内容以 Git diff 为准）。

### 在 Cursor 里本地预览（近似站内）

1. 在 `wiki/` 运行 `.\预览Halo页.ps1`（默认 `home.md`）或 `.\预览Halo页.ps1 -File demo\流浪世界服务器Wiki.md`。
2. 生成 `wiki/_preview/` 或 `wiki/demo/_preview/<文件名>.html`（已 gitignore）。
3. **Ctrl+Shift+P → Simple Browser: Show**，粘贴任务输出里的 `file:///.../_preview/....html` 地址（需联网加载 marked.js CDN）。
4. 改完 `.md` 后**重新运行编译**再刷新 Simple Browser。

局限：导出里缺的 HTML 块（如仅留脚本无 `#wanderCard` 结构）会用占位卡片；`/upload/` 图片走 `wiki/demo/upload/`；视频/字体与线上一致性不保证。

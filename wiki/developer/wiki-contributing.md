---
title: Wiki 贡献与待完善条目
slug: developer/wiki-contributing
description: 如何维护 Wiki、建设中页面列表。
categories: [Wiki, 开发者]
tags: [Wiki]
---

# Wiki 贡献与待完善条目

## Git 为准（发布到 Halo）

1. 改 `wiki/` 源文件（混合页用 `{{MCWWS_*}}` 引用 `wiki/_halo/`）。
2. `wiki/预览Halo页.ps1` → 浏览器打开 `_preview/*.html`。
3. **推荐（自动上线）**：复制 `wiki/.halo.env.example` 为 `wiki/.halo.env`，填入 `HALO_PAT=pat_…`（控制台 → 个人中心 → 个人令牌，勾选文章权限），然后：
   ```powershell
   cd wiki
   .\推送到Halo.ps1 -File player\world-building\index.md -RewriteUpload -Publish
   ```
   脚本会编译 HTML、按 frontmatter 的 `slug` 创建或更新文章，并给出 `/archives/...` 链接。
4. 或 `wiki/发布到Halo.ps1` / `wiki/导出Halo文章JSON.ps1 -RewriteUpload`（手动粘贴 / JSON 导入）。
5. 勿在 Halo 后台改完后覆盖 Git；若线上 drift，导出到 `wiki/demo/` 作对照再合并回 Git。

## Wiki 红链（类似 MediaWiki）

Halo **没有**内置红链。本站通过主题已加载的 `rs-redlinks.js` 实现：

- 正文里指向 `/archives/{slug}` 的内链，若 **Halo 尚未发布**该 slug（见 `wiki-slugs.json` 的 `slugs` + `redlinkTargets`，或前台 API 查 `rs.wiki/redlink-target-slug`），会显示为**红色虚线链接**。
- `gitSlugs` 仅作规划参考；Git 里有 `prices.md` 但未发布时**不会**再误判为蓝链。
- **已登录**且有发文权限的用户点击红链 → **继承当前文章页**的分类、标签、封面；标题取**红链文字**；**先发布**后在本标签页打开新建页。**新建 `spec.slug`** 与链接目标一致（`player/rules` → `player_rules`，`提出` → `提出`）。历史 `mcwws_*` / 旧 `rs_*` 页面仍可用，后续再统一优化。**Shift+点击**跳过确认框；或在 `rs-config.js` 设 `redlinks.skipConfirm: true` 一律免确认。
- **后台编辑器**：Injector 2.0 **无法**向 `/console/**` 注入（HEAD 仅主题、WebFilter 跳过 console）。须 patch jar 内 `ui/console.html`：
  ```powershell
  python tools/mcwws-halo-preview/patch-halo-console-loader.py
  ```
  硬刷新后控制台应出现 `RS Loader` 与 `[rs-wikilink] 已就绪`。选中文字 → 🔗 / Ctrl+K / 工具栏链环。
- 未登录会跳转到登录页。
- **后台编辑器**点「发布」后：需全站加载 `rs-loader.js`（Halo **系统 → 代码注入 → head/footer** 增加 `<script src="/upload/wiki-data/rs-loader.js"></script>`），成功后自动进入 `/archives/{slug}`，不再留在 `/console`。

维护索引（发布 Wiki 后建议执行一次）：

```powershell
python tools/mcwws-halo-preview/export-wiki-slugs.py
```

**批量补 `halo-manual-id`（正文头部 HTML 模块，与 Wiki 发布一致）**：

```powershell
python tools/mcwws-halo-preview/ensure-halo-manual-id.py --dry-run
python tools/mcwws-halo-preview/ensure-halo-manual-id.py
```

**批量把红链占位文章的 UUID slug 改为链接目标路径**（本地需 `halo-mysql` 容器）：

```powershell
python tools/mcwws-halo-preview/rename-redlink-slugs.py --prefix "" --force-english --dry-run
python tools/mcwws-halo-preview/rename-redlink-slugs.py --prefix "" --force-english --restart-halo
python tools/mcwws-halo-preview/export-wiki-slugs.py
```

**去掉历史 `rs_` 前缀**（`mcwws_*` 不动）：

```powershell
python tools/mcwws-halo-preview/strip-rs-slug-prefix.py --dry-run
python tools/mcwws-halo-preview/strip-rs-slug-prefix.py --restart-halo
python tools/mcwws-halo-preview/export-wiki-slugs.py
```

改 slug 后须 **`--restart-halo`**（或手动 `docker restart halo`），否则 `/archives/` 可能仍 404（索引未刷新）。

需 `wiki/.halo.env` 中的 `HALO_PAT`（仅 `ensure-halo-manual-id.py` API 版）。前台 `rs-ensure-manual-id.js` 仅在缺 ID 时 DOM 注入以便快速编辑，**持久化请跑上述脚本**。

输出：`1panel/apps/halo/halo/data/attachments/upload/wiki-data/wiki-slugs.json`（Git 已跟踪，需随 Wiki 推送）。

可在 `rs-config.js` 的 `redlinks` 段关闭 `createOnClick` 或 `enabled`。

若编辑器 **一直转圈**、并导致其他页面无法刷新：多为草稿 `inProgress` 卡住（占满浏览器对 Halo 的连接数）。本地可修复：

```powershell
python tools/mcwws-halo-preview/repair-stuck-draft.py <文章 metadata.name UUID>
```

然后关闭卡住的编辑标签页，重新打开 `/console/posts/editor?name=...`。

## Halo 交互页（与 demo 同系）

- 共享样式与脚本：`wiki/_halo/mcwws-wiki.css`、`wiki/_halo/mcwws-wiki.js`
- 在页面 frontmatter 之后按 **demo 顺序** 插入多块（每块可单独一行 UUID）：
  1. `{{WANDER_DEMO_NAV_CSS}}` + **HTML** 导航（`.nav-quote-box`）
  2. `{{WANDER_DEMO_CARD_CSS}}` + **HTML** 卡片（`#wanderCard` 的 `.wd-smart-card` 结构，见 `home.md` / `demo/流浪世界服务器Wiki.md`）
  3. `{{WANDER_DEMO_CARD_JS}}` — 与 demo 相同的 hover / 视频交互
  4. 可选 `{{MCWWS_HALO_CSS}}` / `{{MCWWS_HALO_JS}}` 做次级入口网格
- 子专题页可继续用纯 Markdown；需要卡片/步骤条时复制上述结构即可

## 待完善

（正文待撰写。个人草稿请放在站内草稿区或本仓库 PR，勿挂在全站首页。）

[← 开发者文档](index.md)

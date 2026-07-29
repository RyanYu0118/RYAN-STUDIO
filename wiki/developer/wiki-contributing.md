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

- 正文里指向 `/archives/{slug}` 的内链，若 **Halo 尚未发布**该 slug（见 `wiki-slugs.json` 的 `slugs`，仅来自 API），会显示为**红色虚线链接**。
- `gitSlugs` 仅作规划参考；Git 里有 `prices.md` 但未发布时**不会**再误判为蓝链。
- **已登录**且有发文权限的用户点击红链 → 确认后为该 slug **创建 Markdown 草稿**并打开控制台编辑器。
- 未登录会跳转到登录页。

维护索引（发布 Wiki 后建议执行一次）：

```powershell
python tools/mcwws-halo-preview/export-wiki-slugs.py
```

输出：`1panel/apps/halo/halo/data/attachments/upload/wiki-data/wiki-slugs.json`（Git 已跟踪，需随 Wiki 推送）。

可在 `rs-config.js` 的 `redlinks` 段关闭 `createOnClick` 或 `enabled`。

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

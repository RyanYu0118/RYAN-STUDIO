# RS Wiki 链接 — Halo 2 编辑器插件

在 Halo **默认富文本编辑器**中提供 MediaWiki 风格的 Wiki 内链：选中文字 → 气泡栏 **Wiki 链接**（书本图标）→ 搜索 slug / 红链 → 写入 `/archives/{slug}`。

与 Halo **原生链环**（普通链接 / 取消 / 打开）**并存**，不再依赖 `rs-console-wikilink.js` 的 DOM 注入。

## 功能

- 气泡菜单 `TEXT_BUBBLE_MENU` 内新增 **Wiki 链接** 按钮（priority 118，紧邻原生链环）
- slug 自动补全（`/upload/wiki-data/wiki-slugs.json` + 已发布文章 API）
- 未发布页显示红链预览（编辑器内 `.rs-wiki-redlink`）
- 支持外部 URL（`https://`）
- 快捷键：**Ctrl+Shift+K** 打开 Wiki 面板（避免与 Halo 全局 Ctrl+K 搜索冲突）

## 环境要求

- **Java 21**
- **Node.js 18+** 与 **pnpm**（Gradle 构建 UI 时会自动调用）
- **Halo >= 2.25.0**

## 构建

```powershell
cd tools/halo-plugin-wikilink
.\build.ps1
```

产物：`build/libs/plugin-RS_WikiLink-<version>.jar`（当前 1.0.2）

或手动：

```powershell
.\gradlew.bat build -x test
```

## 安装

> 若曾安装旧版 `mcwws-wikilink`，请先卸载再安装 `RS_WikiLink`（插件 ID 已变更）。

1. Halo 控制台 → **插件** → **安装**
2. 上传 `build/libs/plugin-RS_WikiLink-*.jar`
3. **启用**插件
4. 硬刷新文章编辑页 `/console/posts/editor`

## 启用插件后

建议在 `rs-config.js` 关闭注入版 Wiki 链接，避免重复：

```javascript
wikilink: { enabled: false }
```

并可在 `rs-loader.js` 中注释掉 `rs-console-wikilink.js` 的加载。

**仍保留**（与插件配合）：

- 前台 `rs-redlinks.js`（红链点击建页）
- `wiki-slugs.json` 索引
- `export-post-json.py` 的 `[[wiki]]` 语法

## 本地调试

```powershell
.\gradlew.bat haloServer
```

需配置 `halo` 插件开发环境（见 [Halo 插件开发文档](https://docs.halo.run/developer-guide/plugin/basics/)）。

## 目录结构

```
tools/halo-plugin-wikilink/
├── src/main/java/          # Java 插件入口（空壳，逻辑在 UI）
├── src/main/resources/plugin.yaml
└── ui/src/
    ├── index.ts            # definePlugin + extensionPoints
    ├── editor/             # TipTap Extension（getBubbleMenu）
    ├── components/         # WikiLinkBubbleButton + WikiLinkPanel
    └── lib/                  # slug 工具、索引加载、setLink 命令
```

## 与 rs-console-wikilink.js 对比

| 能力 | 注入脚本 | 本插件 |
|------|----------|--------|
| 气泡栏接入 | DOM 猜测 + MutationObserver | `getBubbleMenu` 官方 API |
| 选区 | window.getSelection hack | `editor.state.selection` |
| Ctrl+K | 与全局搜索冲突 | Ctrl+Shift+K（可扩展 Mod-k） |
| 控制台加载 | jar patch + rs-loader | 插件生命周期自动加载 |

# RS 编辑器增强 — Halo 2 编辑器插件

在 Halo **默认富文本编辑器**中提供：

- **Wiki 内链**：选中文字 → 气泡栏书本图标 → slug 搜索 / 红链
- **HTML 编辑块**：iframe 紧凑预览、全屏编辑、从服务器/片段自动修复截断（v4.0 插件模式）

与 Halo **原生链环**并存；不再依赖 `rs-console-wikilink.js` / `rs-console-html-block-compact.js` 注入。

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

产物：`build/libs/RS_WikiLink-<version>.jar`（当前 1.1.1）

或手动：

```powershell
.\gradlew.bat build -x test
```

## 安装

> 若曾安装旧版 `mcwws-wikilink`，请先卸载再安装 `RS_WikiLink`（插件 ID 已变更）。

1. Halo 控制台 → **插件** → **安装**
2. 上传 `build/libs/RS_WikiLink-*.jar`
3. **启用**插件
4. 硬刷新文章编辑页 `/console/posts/editor`

## 启用插件后

在 `rs-config.js` 关闭注入版（避免与插件重复）：

```javascript
wikilink: { enabled: false }
htmlBlockCompact: { enabled: false }
```

并可在 `rs-loader.js` 中注释掉 `rs-console-wikilink.js` / `rs-console-html-block-compact.js`。

**仍保留**（与插件配合）：

- 前台 `rs-redlinks.js`（红链点击建页）
- `wiki-slugs.json` 索引
- `export-post-json.py` 的 `[[wiki]]` 语法

## Release

GitHub Release：[RS_WikiLink-v1.1.1](https://github.com/RyanYu0118/RYAN-STUDIO/releases/tag/RS_WikiLink-v1.1.1)（直接下载 JAR，无需本地构建）

打新标签 `RS_WikiLink-v*` 推送后会自动构建并发布（见仓库根目录 `.github/workflows/rs-wikilink-release.yml`）。

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

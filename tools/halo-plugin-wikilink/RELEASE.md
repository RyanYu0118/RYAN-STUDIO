# RS_WikiLink v1.0.3

Halo 2 编辑器 **Wiki 内链**插件：选中文字 → 气泡栏书本图标 → slug 搜索 / 红链 → 写入 `/archives/{slug}`。

## 要求

- Halo **>= 2.25.0**

## 安装

1. 下载下方 **`plugin-RS_WikiLink-1.0.3.jar`**
2. Halo 控制台 → **插件** → **安装** → 上传 JAR
3. **启用**插件，硬刷新文章编辑页 `/console/posts/editor`

> 若曾安装旧版 `mcwws-wikilink`，请先卸载再安装 `RS_WikiLink`。

## 使用

| 操作 | 说明 |
|------|------|
| 选中文字 | 气泡栏出现 **Wiki 链接**（书本图标，紧邻原生链环） |
| 点击条目 | 直接插入链接并关闭面板 |
| **Ctrl+Shift+K** | 打开 Wiki 面板（不与 Halo 全局 Ctrl+K 冲突） |
| 外部 URL | 输入 `https://…` 可插入普通外链 |

## 与 Wiki 站点配合

启用插件后建议在 `rs-config.js` 关闭注入版：

```javascript
wikilink: { enabled: false }
```

前台红链、slug 索引（`wiki-slugs.json`）等仍由现有 RS 脚本提供。

## 本版本变更

- **1.0.3** — 更新插件图标
- **1.0.2** — 插件 ID 重命名为 `RS_WikiLink`
- **1.0.1** — 点击条目即确认、副标题字号、气泡按钮图标修复
- **1.0.0** — 初始发布（替代 `rs-console-wikilink.js` 注入方案）

## 源码

仓库路径：`tools/halo-plugin-wikilink/`

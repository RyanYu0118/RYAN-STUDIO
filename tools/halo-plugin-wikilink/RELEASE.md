# RS_WikiLink v1.1.1 — RS 编辑器增强

## 本版变更

- JAR 文件名改为 **`RS_WikiLink-<version>.jar`**（去掉 `plugin-` 前缀）
- 含 v1.1.0 全部功能：Wiki 内链 + HTML 编辑块插件模式（v4.0.0 截断修复）

## 要求

- Halo **>= 2.25.0**
- 需安装 **hybrid-edit-block**（HTML 编辑块）

## 安装

1. 下载下方 **`RS_WikiLink-1.1.1.jar`**
2. Halo 控制台 → **插件** → 安装/升级 → 启用
3. 硬刷新 `/console/posts/editor`

## 启用插件后

在 `rs-config.js` 关闭注入版：

```javascript
wikilink: { enabled: false }
htmlBlockCompact: { enabled: false }
```

## 使用

| 功能 | 操作 |
|------|------|
| Wiki 内链 | 选中文字 → 气泡栏书本图标 · **Ctrl+Shift+K** |
| HTML 块 | iframe 紧凑预览 · **全屏编辑** · 自动修复截断 |
| 手动修复 | 控制台 `RSHtmlBlockCompact.repairNow()` 或「从服务器恢复」 |

## 验证

控制台应出现：`[rs-html-block-compact] v4.0.0 插件模式 已就绪`

## 源码

`tools/halo-plugin-wikilink/`

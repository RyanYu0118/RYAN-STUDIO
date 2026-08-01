# RS_WikiLink v1.1.0 — RS 编辑器增强

## 新功能

- **HTML 编辑块**（插件模式 v4.0）：iframe 紧凑预览、全屏编辑、截断自动修复（最多 15 次重试）
- 通过 TipTap Extension 直接绑定 `editor.view`，不再依赖 jar patch 加载注入脚本
- Wiki 内链（v1.0.x 功能保留）

## 安装

1. 下载 **`RS_WikiLink-1.1.0.jar`**
2. Halo 控制台 → 插件 → 安装/升级 → 启用
3. 硬刷新 `/console/posts/editor`

## 启用插件后

在 `rs-config.js` 关闭注入版：

```javascript
wikilink: { enabled: false }
htmlBlockCompact: { enabled: false }
```

## 调试

控制台应出现：

- `[rs-html-block-compact] v4.0.0 插件模式 已就绪`
- Wiki 链接书本图标

手动修复截断：

```javascript
RSHtmlBlockCompact.repairNow()
```

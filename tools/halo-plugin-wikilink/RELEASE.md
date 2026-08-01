# Release 说明

GitHub Release 正文由 CI 脚本 [`scripts/gen-release-notes.sh`](scripts/gen-release-notes.sh) 自动生成：**只列出相比上一 tag 的变更**，不会重复粘贴安装步骤与功能总表。

**注意：** workflow 须 `fetch-depth: 0` + `fetch-tags: true`，否则 CI 浅克隆拿不到历史 tag，会误显示「首个版本」。

## Tag 命名（Release 侧边栏排序）

GitHub Releases 页左侧 **Release list 按 tag 名字母序排列**，不是按时间或 semver。

未补零时会出现：`v1.1.9` 排在 `v1.1.11` 上面，而 `v1.1.10+` 沉到底部。

**规范：** tag 使用 patch 三位补零，例如：

| `gradle.properties` 版本 | Git tag |
|--------------------------|---------|
| `1.1.13` | `RS_WikiLink-v1.1.013` |
| `1.1.2` | `RS_WikiLink-v1.1.002` |

由 [`scripts/format-release-tag.ps1`](scripts/format-release-tag.ps1) / [`release.ps1`](release.ps1) 自动生成。Release 标题仍显示人类可读版本 `RS_WikiLink v1.1.13`。

### 迁移已有旧 tag

若历史上已打过未补零 tag，可一次性迁移（会 push 新 tag、删除旧 tag，可能触发 CI）：

```powershell
cd tools/halo-plugin-wikilink
.\scripts\migrate-release-tags.ps1 -WhatIf   # 预览
.\scripts\migrate-release-tags.ps1           # 执行
```

迁移后若 GitHub **Drafts** 标签页仍有条目（owner 可见、公开 API 看不到），执行：

```powershell
gh auth login
cd tools/halo-plugin-wikilink
.\scripts\publish-release-drafts.ps1
```

或在 GitHub → Releases → Drafts → 逐条 **Publish release**。

公开验证：匿名 API 应返回 `draft: false`，例如 [RS_WikiLink-v1.1.013](https://github.com/RyanYu0118/RYAN-STUDIO/releases/tag/RS_WikiLink-v1.1.013)。

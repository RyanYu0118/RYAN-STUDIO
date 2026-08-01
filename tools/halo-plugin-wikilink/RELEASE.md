# Release 说明

GitHub Release 正文由 CI 脚本 [`scripts/gen-release-notes.sh`](scripts/gen-release-notes.sh) 自动生成：**只列出相比上一 tag 的变更**，不会重复粘贴安装步骤与功能总表。

发版前请确保插件相关 commit 标题能准确概括本版改动（中文标题会被提取为 Release bullet）。

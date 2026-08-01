#!/usr/bin/env bash
# 生成 GitHub Release 正文：仅「相比上一 tag 的变更」，不重复安装/功能总表。
set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "usage: gen-release-notes.sh RS_WikiLink-vX.Y.Z" >&2
  exit 1
fi

PREV="$(git tag -l 'RS_WikiLink-v*' --sort=-v:refname | grep -vx "$TAG" | head -1 || true)"
OUT="${2:-release-body.md}"
PLUGIN_DIR="tools/halo-plugin-wikilink"

{
  if [[ -n "$PREV" ]]; then
    echo "## 相比 ${PREV} 的变更"
  else
    echo "## 首个版本"
  fi
  echo ""

  if [[ -z "$PREV" ]]; then
    echo "- 首次发布 RS_WikiLink 插件"
  elif ! git log "${PREV}..HEAD" --pretty=format:'%s' -- "$PLUGIN_DIR" | grep -q .; then
    echo "- （无 ${PLUGIN_DIR} 目录下的提交，请检查 tag 范围）"
  else
    git log "${PREV}..HEAD" --pretty=format:'%s' -- "$PLUGIN_DIR" | while IFS= read -r subject; do
      # 双语 commit 标题：取英文 Conventional 类型出现前的中文段
      note="$(printf '%s' "$subject" | sed -E 's/ (fix|feat|docs|chore|refactor|perf|test|build|style)\([^)]+\):.*$//')"
      # 去掉标题末尾版本号，如「… v1.1.3」
      note="$(printf '%s' "$note" | sed -E 's/ v[0-9]+\.[0-9]+\.[0-9]+$//')"
      printf -- '- %s\n' "$note"
    done
  fi
} >"$OUT"

cat "$OUT"

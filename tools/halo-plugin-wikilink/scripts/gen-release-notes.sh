#!/usr/bin/env bash
# 生成 GitHub Release 正文：仅「相比上一 tag 的变更」，不重复安装/功能总表。
set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "usage: gen-release-notes.sh RS_WikiLink-vX.Y.Z" >&2
  exit 1
fi

OUT="${2:-release-body.md}"
PLUGIN_DIR="tools/halo-plugin-wikilink"

# CI 浅克隆时 tag 可能缺失，尽力补拉
git fetch --tags --force >/dev/null 2>&1 || true

PREV="$(git tag -l 'RS_WikiLink-v*' --sort=-v:refname | grep -vx "$TAG" | head -1 || true)"

format_subject() {
  local subject="$1"
  local note
  note="$(printf '%s' "$subject" | sed -E 's/ (fix|feat|docs|chore|refactor|perf|test|build|style)\([^)]+\):.*$//')"
  note="$(printf '%s' "$note" | sed -E 's/ v[0-9]+\.[0-9]+\.[0-9]+$//')"
  printf '%s' "$note"
}

emit_log_range() {
  local range="$1"
  shift
  git log "$range" --pretty=format:'%s' -- "$@" | while IFS= read -r subject; do
    [[ -z "$subject" ]] && continue
    printf -- '- %s\n' "$(format_subject "$subject")"
  done
}

{
  if [[ -n "$PREV" ]]; then
    echo "## 相比 ${PREV} 的变更"
  else
    echo "## 相比上一版本的变更"
  fi
  echo ""

  if [[ -z "$PREV" ]]; then
    echo "- 首次发布 RS_WikiLink 插件"
  else
    RANGE="${PREV}..${TAG}"
    if git log "$RANGE" --pretty=format:'%s' -- "$PLUGIN_DIR" | grep -q .; then
      emit_log_range "$RANGE" "$PLUGIN_DIR"
    elif git log "$RANGE" --pretty=format:'%s' | grep -q .; then
      emit_log_range "$RANGE"
    else
      echo "- （${PREV} → ${TAG} 无 git 提交记录，可能为仅重打 tag）"
    fi
  fi
} >"$OUT"

cat "$OUT"

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
  local note="$subject"
  # 去掉同一行里的英文 Conventional Commits 半句（双语 commit）
  note="$(printf '%s' "$note" | sed -E 's/[[:space:]]+(fix|feat|docs|chore|refactor|perf|test|build|style)\([^)]+\):.*$//')"
  # 去掉中文 Conventional 前缀
  note="$(printf '%s' "$note" | sed -E 's/^(修复|新功能|文档|格式|重构|性能|测试|杂项|构建)\([^)]+\):[[:space:]]*//')"
  # 去掉尾部版本号及可能残留的英文半句
  note="$(printf '%s' "$note" | sed -E 's/[[:space:]]+v[0-9]+\.[0-9]+\.[0-9]+.*$//')"
  note="$(printf '%s' "$note" | sed -E 's/[[:space:]]+(fix|feat|docs|chore|refactor|perf|test|build|style)\([^)]+\):.*$//')"
  note="$(printf '%s' "$note" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ -z "$note" ]]; then
    note="$subject"
  fi
  printf '%s' "$note"
}

emit_log_range() {
  local range="$1"
  shift
  local subject
  # %s%n 确保每条 subject 以换行结束，避免 pipe + while read 在 CI 漏掉唯一 commit
  while IFS= read -r subject || [[ -n "$subject" ]]; do
    [[ -z "$subject" ]] && continue
    printf -- '- %s\n' "$(format_subject "$subject")"
  done < <(git log "$range" --pretty=format:'%s%n' -- "$@")
}

has_commits_in_range() {
  local range="$1"
  shift
  git log "$range" --pretty=format:'%s' -- "$@" | grep -q .
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
    EMITTED=""
    if has_commits_in_range "$RANGE" "$PLUGIN_DIR"; then
      EMITTED="$(emit_log_range "$RANGE" "$PLUGIN_DIR")"
    elif has_commits_in_range "$RANGE"; then
      EMITTED="$(emit_log_range "$RANGE")"
    fi
    if [[ -n "$EMITTED" ]]; then
      printf '%s' "$EMITTED"
      [[ "$EMITTED" != *$'\n' ]] && echo
    else
      if has_commits_in_range "$RANGE"; then
        echo "- （提交存在但未能解析标题，见 compare: ${PREV}...${TAG}）"
      else
        echo "- （${PREV} → ${TAG} 无 git 提交记录，可能为仅重打 tag）"
      fi
    fi
  fi
} >"$OUT"

cat "$OUT"

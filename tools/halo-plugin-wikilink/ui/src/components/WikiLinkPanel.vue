<script setup lang="ts">
import { applyWikiLink, getSelectedText } from '@/lib/wiki-link-commands'
import { reloadWikiIndex, getWikiIndexState } from '@/lib/wiki-index'
import {
  findPageByQuery,
  isExternalUrl,
  normalizeExternalUrl,
  normalizeTarget,
  searchPages,
  type WikiPage,
} from '@/lib/wiki-utils'
import type { WikiBubbleItemProps } from '@/lib/editor-types'
import { computed, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<WikiBubbleItemProps>(), {
  isActive: () => false,
  visible: () => true,
  action: undefined,
})

const query = ref('')
const activeSlug = ref('')
const loading = ref(false)
const indexReady = ref(0)

const initialText = computed(() => getSelectedText(props.editor))

const results = computed(() => {
  indexReady.value
  const { pageIndex, suggestPaths, publishedSlugs } = getWikiIndexState()
  const q = query.value.trim()
  if (q && isExternalUrl(q)) {
    const href = normalizeExternalUrl(q)
    return [
      {
        slug: href,
        title: '外部链接',
        published: true,
        external: true,
        meta: href,
      },
    ]
  }
  const list = searchPages(q, pageIndex, suggestPaths, publishedSlugs)
  if (q && !findPageByQuery(q, pageIndex, publishedSlugs) && !isExternalUrl(q)) {
    return [
      {
        slug: q,
        title: q,
        published: false,
        red: true,
        meta: '此页面尚未创建 · 将插入红链',
      },
      ...list,
    ]
  }
  return list
})

onMounted(async () => {
  loading.value = true
  query.value = initialText.value
  activeSlug.value = query.value
  await reloadWikiIndex()
  indexReady.value++
  loading.value = false
})

function resolveTarget(raw: string): string {
  const { pageIndex, publishedSlugs } = getWikiIndexState()
  const hit = findPageByQuery(raw, pageIndex, publishedSlugs)
  return hit?.slug || raw
}

function pick(row: WikiPage) {
  const raw = row.external ? row.slug : row.slug || row.title
  if (!raw) return
  applyWikiLink(props.editor, raw, initialText.value)
  window.dispatchEvent(new CustomEvent('rs-wikilink-close'))
}

function finish() {
  const raw = query.value.trim() || activeSlug.value
  if (!raw) return
  applyWikiLink(props.editor, resolveTarget(raw), initialText.value)
  window.dispatchEvent(new CustomEvent('rs-wikilink-close'))
}

function rowMeta(row: WikiPage) {
  if (row.meta) return row.meta
  if (row.external) return row.slug
  if (!row.published) return `${row.slug} · 草稿`
  return row.slug
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    finish()
  }
}
</script>

<template>
  <div class="rs-wiki-panel">
    <div class="rs-wiki-panel__head">
      <span class="rs-wiki-panel__title">Wiki 链接</span>
      <button type="button" class="rs-wiki-panel__done" @click="finish">完成</button>
    </div>
    <div class="rs-wiki-panel__search">
      <input
        v-model="query"
        type="text"
        placeholder="Wiki 页面名，或 https:// 外部地址…"
        autocomplete="off"
        @keydown="onKeydown"
      />
    </div>
    <div v-if="loading" class="rs-wiki-panel__hint">加载页面索引…</div>
    <div v-else class="rs-wiki-panel__results">
      <button
        v-for="row in results"
        :key="row.slug + row.title"
        type="button"
        class="rs-wiki-panel__row"
        :class="{ red: row.red }"
        @click="pick(row)"
      >
        <span class="icon">{{ row.external ? '↗' : row.red ? '?' : row.published ? '✓' : '◦' }}</span>
        <span class="body">
          <span class="label">{{ row.title }}</span>
          <span class="meta">{{ rowMeta(row) }}</span>
        </span>
      </button>
      <div v-if="!results.length" class="rs-wiki-panel__hint">输入页面名称，或从列表中选择</div>
    </div>
    <div class="rs-wiki-panel__foot">原生链环（普通链接 / 取消 / 打开）仍可使用 · Ctrl+Shift+K</div>
  </div>
</template>

<style scoped lang="scss">
.rs-wiki-panel {
  width: min(360px, calc(100vw - 24px));
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.rs-wiki-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #eee;
}

.rs-wiki-panel__title {
  flex: 1;
  font: 600 14px system-ui, sans-serif;
  text-align: center;
}

.rs-wiki-panel__done {
  border: none;
  background: transparent;
  cursor: pointer;
  font: 500 13px system-ui, sans-serif;
  color: #1976d2;
}

.rs-wiki-panel__search {
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.rs-wiki-panel__search input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 9px 10px;
  font: 14px system-ui, sans-serif;
}

.rs-wiki-panel__results {
  max-height: 240px;
  overflow: auto;
}

.rs-wiki-panel__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 8px 12px;
  cursor: pointer;
}

.rs-wiki-panel__row:hover {
  background: #f5f5f5;
}

.rs-wiki-panel__row.red .label {
  color: #c62828;
  font-weight: 600;
}

.rs-wiki-panel__row .icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #eee;
  display: flex;
  align-items: center;
  justify-content: center;
  font: 600 14px sans-serif;
  color: #666;
  flex-shrink: 0;
}

.rs-wiki-panel__row.red .icon {
  background: #ffebee;
  color: #c62828;
}

.rs-wiki-panel__row .body {
  min-width: 0;
}

.rs-wiki-panel__row .label {
  display: block;
  font: 14px system-ui, sans-serif;
}

.rs-wiki-panel__row .meta {
  display: block;
  font: 12px/1.45 system-ui, sans-serif;
  color: #666;
  margin-top: 2px;
}

.rs-wiki-panel__hint,
.rs-wiki-panel__foot {
  padding: 8px 12px 10px;
  font: 12px/1.45 system-ui, sans-serif;
  color: #666;
  border-top: 1px solid #f0f0f0;
}
</style>

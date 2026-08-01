<script setup lang="ts">
import WikiLinkPanel from '@/components/WikiLinkPanel.vue'
import { VDropdown, vTooltip } from '@halo-dev/components'
import type { WikiBubbleItemProps } from '@/lib/editor-types'
import { onMounted, onUnmounted, ref } from 'vue'

const WIKI_TOOLTIP = 'Wiki 链接 (Ctrl+Shift+K)'

const props = withDefaults(defineProps<WikiBubbleItemProps>(), {
  isActive: () => false,
  visible: () => true,
  action: undefined,
})

const open = ref(false)

function onClose() {
  open.value = false
}

function handleGlobalOpen() {
  if (!props.visible?.({ editor: props.editor })) return
  open.value = true
}

onMounted(() => {
  window.addEventListener('rs-wikilink-open', handleGlobalOpen)
  window.addEventListener('rs-wikilink-close', onClose)
})

onUnmounted(() => {
  window.removeEventListener('rs-wikilink-open', handleGlobalOpen)
  window.removeEventListener('rs-wikilink-close', onClose)
})
</script>

<template>
  <VDropdown
    v-if="visible?.({ editor })"
    v-model:shown="open"
    :triggers="['click']"
    :distance="10"
  >
    <button
      v-tooltip="WIKI_TOOLTIP"
      type="button"
      class="rs-wiki-bubble-btn"
      :class="{ 'rs-wiki-bubble-btn--active': isActive?.({ editor }) }"
      :aria-label="WIKI_TOOLTIP"
    >
      <svg
        class="rs-wiki-bubble-btn__icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M21 18H6a1 1 0 1 0 0 2h15v2H6a3 3 0 0 1-3-3V4a2 2 0 0 1 2-2h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1ZM5 16.05q.243-.05.5-.05H19V4H5v12.05ZM16 9H8V7h8v2Z"
        />
      </svg>
    </button>
    <template #popper>
      <WikiLinkPanel :editor="editor" />
    </template>
  </VDropdown>
</template>

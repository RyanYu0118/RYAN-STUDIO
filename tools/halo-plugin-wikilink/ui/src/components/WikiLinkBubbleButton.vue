<script setup lang="ts">
import type { WikiBubbleItemProps } from '@/lib/editor-types'
import { onMounted, onUnmounted, ref } from 'vue'

const WIKI_TOOLTIP = 'Wiki 链接 (Ctrl+Shift+K)'

const props = withDefaults(defineProps<WikiBubbleItemProps>(), {
  isActive: () => false,
  visible: () => true,
  action: undefined,
})

const panelOpen = ref(false)

function openPanel() {
  if (!props.visible?.({ editor: props.editor })) return
  window.dispatchEvent(
    new CustomEvent('rs-wikilink-open', { detail: { editor: props.editor } })
  )
}

function onClose() {
  panelOpen.value = false
}

function onOpen() {
  panelOpen.value = true
}

onMounted(() => {
  window.addEventListener('rs-wikilink-open', onOpen)
  window.addEventListener('rs-wikilink-close', onClose)
})

onUnmounted(() => {
  window.removeEventListener('rs-wikilink-open', onOpen)
  window.removeEventListener('rs-wikilink-close', onClose)
})
</script>

<template>
  <button
    v-if="visible?.({ editor })"
    v-tooltip="WIKI_TOOLTIP"
    type="button"
    class="rs-wiki-bubble-btn"
    :class="{ 'rs-wiki-bubble-btn--active': panelOpen || isActive?.({ editor }) }"
    :aria-label="WIKI_TOOLTIP"
    @click="openPanel"
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
</template>

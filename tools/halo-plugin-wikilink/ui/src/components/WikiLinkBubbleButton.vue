<script setup lang="ts">
import WikiLinkPanel from '@/components/WikiLinkPanel.vue'
import { VDropdown } from '@halo-dev/components'
import type { WikiBubbleItemProps } from '@/lib/editor-types'
import { BubbleButton } from '@halo-dev/richtext-editor'
import { onMounted, onUnmounted, ref } from 'vue'

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
    <BubbleButton
      :editor="editor"
      :is-active="isActive?.({ editor })"
      tooltip="Wiki 链接 (Ctrl+Shift+K)"
      class="rs-wiki-bubble-btn"
    >
      <svg
        class="rs-wiki-bubble-btn__icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M21 18H6a1 1 0 1 0 0 2h15v2H6a3 3 0 0 1-3-3V4a2 2 0 0 1 2-2h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1ZM5 16.05q.243-.05.5-.05H19V4H5v12.05ZM16 9H8V7h8v2Z"
        />
      </svg>
    </BubbleButton>
    <template #popper>
      <WikiLinkPanel :editor="editor" />
    </template>
  </VDropdown>
</template>

<style scoped>
.rs-wiki-bubble-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.375rem;
  color: #4b5563;
}

.rs-wiki-bubble-btn:hover {
  background: #f3f4f6;
}

.rs-wiki-bubble-btn__icon {
  display: block;
  flex-shrink: 0;
  pointer-events: none;
}
</style>

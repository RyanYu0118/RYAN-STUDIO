<script setup lang="ts">
import WikiLinkPanel from '@/components/WikiLinkPanel.vue'
import { VDropdown } from '@halo-dev/components'
import type { WikiBubbleItemProps } from '@/lib/editor-types'
import { BubbleButton } from '@halo-dev/richtext-editor'
import IconBook2Line from '~icons/ri/book-2-line'
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
  window.addEventListener('mcwws-wikilink-open', handleGlobalOpen)
  window.addEventListener('mcwws-wikilink-close', onClose)
})

onUnmounted(() => {
  window.removeEventListener('mcwws-wikilink-open', handleGlobalOpen)
  window.removeEventListener('mcwws-wikilink-close', onClose)
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
      class="inline-flex size-8 items-center justify-center rounded-md text-lg text-gray-600 hover:bg-gray-100"
    >
      <IconBook2Line />
    </BubbleButton>
    <template #popper>
      <WikiLinkPanel :editor="editor" />
    </template>
  </VDropdown>
</template>

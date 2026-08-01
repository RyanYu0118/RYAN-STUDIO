<script setup lang="ts">
import WikiLinkPanel from '@/components/WikiLinkPanel.vue'
import {
  clampWikiPanelPosition,
  getSelectionAnchorRect,
} from '@/lib/wiki-link-panel-position'
import type { Editor } from '@halo-dev/richtext-editor'
import { nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const placement = ref<'below' | 'above'>('below')
const editor = shallowRef<Editor | null>(null)
const panelRef = ref<HTMLElement | null>(null)

function applyPosition() {
  const ed = editor.value
  const el = panelRef.value
  if (!ed || !el) return
  const anchor = getSelectionAnchorRect(ed)
  if (!anchor) return
  const { width, height } = el.getBoundingClientRect()
  if (width <= 0 || height <= 0) return
  const pos = clampWikiPanelPosition(anchor, width, height)
  x.value = pos.left
  y.value = pos.top
  placement.value = pos.placement
}

function schedulePosition() {
  nextTick(() => {
    applyPosition()
    requestAnimationFrame(applyPosition)
  })
}

function onOpen(event: Event) {
  const detail = (event as CustomEvent<{ editor?: Editor }>).detail
  const ed = detail?.editor
  if (!ed || ed.state.selection.empty) return
  editor.value = ed
  visible.value = true
  schedulePosition()
}

function onClose() {
  visible.value = false
  editor.value = null
}

function requestClose() {
  window.dispatchEvent(new CustomEvent('rs-wikilink-close'))
}

function onKeydown(event: KeyboardEvent) {
  if (!visible.value) return
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  requestClose()
}

function onViewportChange() {
  if (visible.value) schedulePosition()
}

onMounted(() => {
  window.addEventListener('rs-wikilink-open', onOpen)
  window.addEventListener('rs-wikilink-close', onClose)
  window.addEventListener('keydown', onKeydown, true)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('scroll', onViewportChange)
  window.addEventListener('resize', onViewportChange)
})

onUnmounted(() => {
  window.removeEventListener('rs-wikilink-open', onOpen)
  window.removeEventListener('rs-wikilink-close', onClose)
  window.removeEventListener('keydown', onKeydown, true)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('scroll', onViewportChange)
  window.removeEventListener('resize', onViewportChange)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && editor" class="rs-wiki-float">
      <div class="rs-wiki-float__backdrop" @mousedown="requestClose" />
      <div
        ref="panelRef"
        class="rs-wiki-float__panel"
        :class="'rs-wiki-float__panel--' + placement"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
      >
        <WikiLinkPanel :editor="editor" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.rs-wiki-float__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10059;
  background: transparent;
}

.rs-wiki-float__panel {
  position: fixed;
  z-index: 10060;
  max-width: calc(100vw - 16px);
}

.rs-wiki-float__panel--below {
  animation: rs-wiki-float-in-below 0.16s ease-out;
}

.rs-wiki-float__panel--above {
  animation: rs-wiki-float-in-above 0.16s ease-out;
}

@keyframes rs-wiki-float-in-below {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes rs-wiki-float-in-above {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

<script setup lang="ts">
import { collectDragMenuItems } from '@/editor/block-drag-menu-items'
import { EditorDragMenu, type Editor } from '@halo-dev/richtext-editor'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Selection } from '@tiptap/pm/state'
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const menuKey = ref(0)
const editor = shallowRef<Editor | null>(null)
const node = shallowRef<PmNode | null>(null)
const pos = ref(0)
const savedSelection = shallowRef<Selection | null>(null)
const savedScroll = { x: 0, y: 0 }

const items = computed(() => (editor.value ? collectDragMenuItems(editor.value) : []))

function restoreEditorState() {
  const ed = editor.value
  if (!ed) return

  const scrollX = savedScroll.x
  const scrollY = savedScroll.y
  const tr = ed.state.tr
  tr.setMeta('lockDragHandle', false)

  const prev = savedSelection.value
  if (prev) {
    try {
      tr.setSelection(prev)
    } catch {
      /* keep current selection if restore fails */
    }
  }

  ed.view.dispatch(tr)
  requestAnimationFrame(() => {
    window.scrollTo(scrollX, scrollY)
  })
}

function close() {
  if (!visible.value) return
  visible.value = false
  restoreEditorState()
}

type OpenDetail = {
  editor: Editor
  node: PmNode
  pos: number
  x: number
  y: number
  previousSelection?: Selection
  scrollX?: number
  scrollY?: number
}

function onOpen(ev: Event) {
  const detail = (ev as CustomEvent<OpenDetail>).detail
  if (!detail?.editor || !detail.node) return

  const isReposition = visible.value
  if (!isReposition) {
    savedSelection.value = detail.previousSelection ?? detail.editor.state.selection
    savedScroll.x = detail.scrollX ?? window.scrollX
    savedScroll.y = detail.scrollY ?? window.scrollY
  }

  editor.value = detail.editor
  node.value = detail.node
  pos.value = detail.pos
  x.value = detail.x
  y.value = detail.y

  if (isReposition) menuKey.value += 1
  visible.value = true
}

function onDocPointer(ev: MouseEvent) {
  if (!visible.value || ev.button !== 0) return
  const t = ev.target as Element | null
  if (isInsideMenuUi(t)) return
  ev.preventDefault()
  ev.stopPropagation()
  close()
}

function isInsideMenuUi(target: Element | null) {
  if (!target) return false
  return !!target.closest('.rs-block-context-menu, .v-popper, [data-tippy-root], .dropdown')
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && visible.value) close()
}

onMounted(() => {
  window.addEventListener('rs-block-contextmenu-open', onOpen)
  document.addEventListener('mousedown', onDocPointer, true)
  document.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('rs-block-contextmenu-open', onOpen)
  document.removeEventListener('mousedown', onDocPointer, true)
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="rs-block-menu-backdrop">
      <div v-if="visible" class="rs-block-context-menu-backdrop" aria-hidden="true" />
    </Transition>
    <Transition name="rs-block-menu" appear>
      <div
        v-if="visible && editor && node"
        :key="menuKey"
        class="rs-block-context-menu"
        :style="{ left: `${x}px`, top: `${y}px` }"
        @mousedown.stop
        @contextmenu.prevent
      >
        <!-- TipTap Editor 与 Halo 包装类型在编译期不完全一致，运行时同源 -->
        <EditorDragMenu :editor="editor as never" :node="node" :pos="pos" :items="items" @close="close" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rs-block-context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10069;
  background: transparent;
  pointer-events: none;
}

.rs-block-context-menu {
  position: fixed;
  z-index: 10070;
  min-width: 15rem;
  border-radius: 0.5rem;
  background: #fff;
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transform-origin: top left;
}

:global(.rs-block-menu-enter-active),
:global(.rs-block-menu-leave-active) {
  transition:
    opacity 0.16s ease,
    transform 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);
}

:global(.rs-block-menu-enter-from),
:global(.rs-block-menu-leave-to) {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}

:global(.rs-block-menu-backdrop-enter-active),
:global(.rs-block-menu-backdrop-leave-active) {
  transition: opacity 0.16s ease;
}

:global(.rs-block-menu-backdrop-enter-from),
:global(.rs-block-menu-backdrop-leave-to) {
  opacity: 0;
}
</style>

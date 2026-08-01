<script setup lang="ts">
import { collectDragMenuItems } from '@/editor/block-drag-menu-items'
import { EditorDragMenu, type Editor } from '@halo-dev/richtext-editor'
import type { Node as PmNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const editor = shallowRef<Editor | null>(null)
const node = shallowRef<PmNode | null>(null)
const pos = ref(0)

const items = computed(() => (editor.value ? collectDragMenuItems(editor.value) : []))

function unlockDragHandle() {
  const ed = editor.value
  if (!ed) return
  const { tr, selection } = ed.state
  tr.setMeta('lockDragHandle', false)
  const size = tr.doc.content.size
  if (selection instanceof NodeSelection) {
    const inner = Math.min(selection.from + 1, Math.max(0, size - 1))
    tr.setSelection(TextSelection.near(tr.doc.resolve(inner), -1))
  } else if (!selection.empty) {
    const anchor = Math.min(selection.to, Math.max(0, size - 1))
    tr.setSelection(TextSelection.near(tr.doc.resolve(anchor), -1))
  }
  ed.view.dispatch(tr)
}

function close() {
  visible.value = false
  unlockDragHandle()
}

type OpenDetail = {
  editor: Editor
  node: PmNode
  pos: number
  x: number
  y: number
}

function onOpen(ev: Event) {
  const detail = (ev as CustomEvent<OpenDetail>).detail
  if (!detail?.editor || !detail.node) return
  editor.value = detail.editor
  node.value = detail.node
  pos.value = detail.pos
  x.value = detail.x
  y.value = detail.y
  visible.value = true
}

function onDocPointer(ev: MouseEvent) {
  if (!visible.value || ev.button !== 0) return
  const t = ev.target as Element | null
  if (isInsideMenuUi(t)) return
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
    <div
      v-if="visible"
      class="rs-block-context-menu-backdrop"
      @mousedown.left="close"
      @contextmenu.prevent
    />
    <div
      v-if="visible && editor && node"
      class="rs-block-context-menu"
      :style="{ left: `${x}px`, top: `${y}px` }"
      @mousedown.stop
      @contextmenu.prevent
    >
      <!-- TipTap Editor 与 Halo 包装类型在编译期不完全一致，运行时同源 -->
      <EditorDragMenu :editor="editor as never" :node="node" :pos="pos" :items="items" @close="close" />
    </div>
  </Teleport>
</template>

<style scoped>
.rs-block-context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10069;
  background: transparent;
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
}
</style>

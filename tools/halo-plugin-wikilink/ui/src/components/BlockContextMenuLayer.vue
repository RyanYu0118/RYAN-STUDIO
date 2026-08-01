<script setup lang="ts">
import { collectDragMenuItems } from '@/editor/block-drag-menu-items'
import { EditorDragMenu, type Editor } from '@halo-dev/richtext-editor'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Selection } from '@tiptap/pm/state'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

const MENU_VIEWPORT_PAD = 8
/** 底部额外留白，避免 Windows 任务栏 / 浏览器底栏遮挡 */
const MENU_VIEWPORT_PAD_BOTTOM = 48

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const anchorX = ref(0)
const anchorY = ref(0)
const menuKey = ref(0)
const menuRef = ref<HTMLElement | null>(null)
const editor = shallowRef<Editor | null>(null)
const node = shallowRef<PmNode | null>(null)
const pos = ref(0)
const savedSelection = shallowRef<Selection | null>(null)
const savedScroll = { x: 0, y: 0 }

const items = computed(() => (editor.value ? collectDragMenuItems(editor.value) : []))

let safeAreaBottomCache: number | null = null

function readSafeAreaBottom() {
  if (safeAreaBottomCache != null) return safeAreaBottomCache
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)'
  document.body.appendChild(probe)
  safeAreaBottomCache = parseFloat(getComputedStyle(probe).paddingBottom) || 0
  probe.remove()
  return safeAreaBottomCache
}

function clampMenuPosition(clientX: number, clientY: number, menuWidth: number, menuHeight: number) {
  const vv = window.visualViewport
  const viewportLeft = vv?.offsetLeft ?? 0
  const viewportTop = vv?.offsetTop ?? 0
  const viewportWidth = vv?.width ?? window.innerWidth
  const viewportHeight = vv?.height ?? window.innerHeight
  const padBottom = Math.max(MENU_VIEWPORT_PAD_BOTTOM, readSafeAreaBottom() + 12)

  let left = clientX
  let top = clientY

  if (top + menuHeight + padBottom > viewportTop + viewportHeight) {
    top = clientY - menuHeight
  }

  const minLeft = viewportLeft + MENU_VIEWPORT_PAD
  const minTop = viewportTop + MENU_VIEWPORT_PAD
  const maxLeft = viewportLeft + viewportWidth - menuWidth - MENU_VIEWPORT_PAD
  const maxTop = viewportTop + viewportHeight - menuHeight - padBottom

  left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft))
  top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop))

  return { left, top }
}

function applySafePosition() {
  const el = menuRef.value
  if (!el) return
  const { width, height } = el.getBoundingClientRect()
  if (width <= 0 || height <= 0) return
  const pos = clampMenuPosition(anchorX.value, anchorY.value, width, height)
  x.value = pos.left
  y.value = pos.top
}

function scheduleSafePosition() {
  nextTick(() => {
    applySafePosition()
    requestAnimationFrame(applySafePosition)
  })
}

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
  anchorX.value = detail.x
  anchorY.value = detail.y
  x.value = detail.x
  y.value = detail.y

  if (isReposition) menuKey.value += 1
  visible.value = true
  scheduleSafePosition()
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

function onViewportChange() {
  if (visible.value) applySafePosition()
}

watch(menuKey, () => {
  if (visible.value) scheduleSafePosition()
})

onMounted(() => {
  window.addEventListener('rs-block-contextmenu-open', onOpen)
  document.addEventListener('mousedown', onDocPointer, true)
  document.addEventListener('keydown', onKeydown, true)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('scroll', onViewportChange)
  window.addEventListener('resize', onViewportChange)
})

onUnmounted(() => {
  window.removeEventListener('rs-block-contextmenu-open', onOpen)
  document.removeEventListener('mousedown', onDocPointer, true)
  document.removeEventListener('keydown', onKeydown, true)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('scroll', onViewportChange)
  window.removeEventListener('resize', onViewportChange)
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
        ref="menuRef"
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

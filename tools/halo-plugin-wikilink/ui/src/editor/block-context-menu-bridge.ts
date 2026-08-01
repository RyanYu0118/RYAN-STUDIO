import type { Editor } from '@tiptap/core'
import { findParentNodeClosestToPos } from '@tiptap/core'
import { mountBlockContextMenuHost, unmountBlockContextMenuHost } from '@/editor/block-context-menu-host'
import {
  hasCustomContextMenu,
  RS_BLOCK_CONTEXTMENU_PREVIEW_EVENT,
  type BlockContextMenuPreviewDetail,
} from '@/editor/block-context-menu-utils'
import { NodeSelection } from '@tiptap/pm/state'

const RS_BLOCK_CTX_VER = '1.1.12'

type BlockHit = {
  node: NonNullable<ReturnType<Editor['state']['doc']['nodeAt']>>
  pos: number
}

let boundEditor: Editor | null = null
let boundDom: HTMLElement | null = null
let domHandler: ((event: MouseEvent) => void) | null = null
let previewHandler: ((event: Event) => void) | null = null

function isEditorPage() {
  return location.pathname.indexOf('/console/posts/editor') >= 0
}

/** 与 Halo EditorDragHandle 一致：将坐标钳制到编辑器内容区 */
function clampPointerToEditor(view: Editor['view'], x: number, y: number) {
  const dom = view.dom
  const first = dom.firstElementChild
  const last = dom.lastElementChild
  if (!first || !last) return null

  const topRect = first.getBoundingClientRect()
  const bottomRect = last.getBoundingClientRect()
  if (topRect.width <= 0 || bottomRect.height <= 0) return null

  const pad = 5
  const clampedY = Math.min(Math.max(topRect.top + pad, y), bottomRect.bottom - pad)
  const sameColumn = Math.abs(topRect.left - bottomRect.left) < 0.5
  const refRect = sameColumn ? topRect : topRect
  const clampedX = Math.min(Math.max(refRect.left + pad, x), refRect.right - pad)

  if (!Number.isFinite(clampedX) || !Number.isFinite(clampedY)) return null
  return { x: clampedX, y: clampedY }
}

/** Halo drag handle：elementsFromPoint → ProseMirror 直接子节点 */
function findDirectBlockElement(view: Editor['view'], x: number, y: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof Element) || !view.dom.contains(el)) continue
    let cur: Element | null = el
    while (cur?.parentElement && cur.parentElement !== view.dom) {
      cur = cur.parentElement
    }
    if (cur?.parentElement === view.dom && cur instanceof HTMLElement) return cur
  }
  return null
}

function isDraggableBlock(node: NonNullable<ReturnType<Editor['state']['doc']['nodeAt']>>) {
  if (!node.isBlock || node.type.name === 'doc') return false
  return true
}

function findBlockAtPos(editor: Editor, pos: number): BlockHit | null {
  const $pos = editor.state.doc.resolve(Math.max(0, Math.min(pos, editor.state.doc.content.size)))
  const hit = findParentNodeClosestToPos($pos, isDraggableBlock)
  if (hit) return { node: hit.node, pos: hit.pos }

  const node = editor.state.doc.nodeAt(pos)
  if (node && isDraggableBlock(node)) return { node, pos }
  return null
}

function resolvePosFromCoords(editor: Editor, x: number, y: number): number | null {
  const view = editor.view
  const coords = view.posAtCoords({ left: x, top: y })
  if (!coords) return null
  if (coords.inside >= 0) return coords.inside
  return coords.pos
}

function findBlockFromDom(editor: Editor, x: number, y: number): BlockHit | null {
  const view = editor.view
  const blockEl = findDirectBlockElement(view, x, y)
  if (blockEl) {
    try {
      const domPos = view.posAtDOM(blockEl, 0)
      const node = editor.state.doc.nodeAt(domPos)
      if (node && isDraggableBlock(node)) return { node, pos: domPos }
      const hit = findBlockAtPos(editor, domPos)
      if (hit) return hit
    } catch {
      /* try next strategy */
    }
  }
  return null
}

function findBlockFromTarget(editor: Editor, target: Element | null): BlockHit | null {
  const view = editor.view
  let cur: Element | null = target
  while (cur && cur !== view.dom) {
    try {
      const domPos = view.posAtDOM(cur, 0)
      const node = editor.state.doc.nodeAt(domPos)
      if (node && isDraggableBlock(node)) return { node, pos: domPos }
      const hit = findBlockAtPos(editor, domPos)
      if (hit) return hit
    } catch {
      /* walk up */
    }
    cur = cur.parentElement
  }
  return null
}

function findBlockFromHtmlRoot(editor: Editor, root: HTMLElement): BlockHit | null {
  const candidates = [
    root.closest('[data-node-view-wrapper]'),
    root.closest('.rs-html-block-root'),
    root,
  ]
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue
    try {
      const domPos = editor.view.posAtDOM(el, 0)
      const node = editor.state.doc.nodeAt(domPos)
      if (node && isDraggableBlock(node)) return { node, pos: domPos }
      const hit = findBlockAtPos(editor, domPos)
      if (hit) return hit
    } catch {
      /* try next candidate */
    }
  }
  return null
}

function findBlockAtPointer(editor: Editor, x: number, y: number, target?: Element | null): BlockHit | null {
  const fromDom = findBlockFromDom(editor, x, y)
  if (fromDom) return fromDom

  const pos = resolvePosFromCoords(editor, x, y)
  if (pos != null) {
    const hit = findBlockAtPos(editor, pos)
    if (hit) return hit
  }

  if (target) {
    const fromTarget = findBlockFromTarget(editor, target)
    if (fromTarget) return fromTarget
  }

  return findBlockAtPos(editor, editor.state.selection.from)
}

function findBlockHit(editor: Editor, event: MouseEvent): BlockHit | null {
  const clamped = clampPointerToEditor(editor.view, event.clientX, event.clientY)
  const x = clamped?.x ?? event.clientX
  const y = clamped?.y ?? event.clientY
  return findBlockAtPointer(editor, x, y, event.target as Element | null)
}

function openBlockContextMenu(editor: Editor, block: BlockHit, x: number, y: number) {
  const previousSelection = editor.state.selection
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const { tr, doc } = editor.state
  tr.setMeta('lockDragHandle', true)
  tr.setSelection(NodeSelection.create(doc, block.pos))
  editor.view.dispatch(tr)
  requestAnimationFrame(() => {
    window.scrollTo(scrollX, scrollY)
  })

  window.dispatchEvent(
    new CustomEvent('rs-block-contextmenu-open', {
      detail: {
        editor,
        node: block.node,
        pos: block.pos,
        x,
        y,
        previousSelection,
        scrollX,
        scrollY,
      },
    }),
  )
}

function openBlockContextMenuAt(editor: Editor, x: number, y: number, block?: BlockHit | null) {
  const hit = block ?? findBlockAtPointer(editor, x, y)
  if (!hit) {
    console.warn('[rs-block-contextmenu] 未能定位块，已拦截浏览器菜单')
    return
  }
  openBlockContextMenu(editor, hit, x, y)
}

function handleContextMenu(editor: Editor, event: MouseEvent) {
  if (!isEditorPage()) return
  if (!editor.isEditable) return

  const target = event.target as Element | null
  if (!editor.view.dom.contains(target)) return
  if (shouldIgnoreContextTarget(target)) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  openBlockContextMenuAt(editor, event.clientX, event.clientY)
}

function handlePreviewContextMenu(editor: Editor, detail: BlockContextMenuPreviewDetail) {
  if (!isEditorPage()) return
  if (!editor.isEditable) return
  if (!detail?.root) return

  const block = findBlockFromHtmlRoot(editor, detail.root)
  openBlockContextMenuAt(editor, detail.clientX, detail.clientY, block)
}

function shouldIgnoreContextTarget(target: Element | null): boolean {
  if (!target) return true
  if (hasCustomContextMenu(target)) return true
  if (target.closest('textarea, input, select, .cm-editor, .cm-content')) return true
  if (target.closest('.bubble-menu, .v-popper, [data-tippy-root], .rs-wiki-panel')) return true
  if (target.closest('[data-rs-html-fs-overlay], .rs-block-context-menu')) return true
  return false
}

function bindEditorDom(editor: Editor) {
  if (boundEditor === editor && boundDom === editor.view.dom && previewHandler) return

  unbindEditorDom()

  boundEditor = editor
  boundDom = editor.view.dom
  domHandler = (event: MouseEvent) => handleContextMenu(editor, event)
  previewHandler = (event: Event) => {
    handlePreviewContextMenu(editor, (event as CustomEvent<BlockContextMenuPreviewDetail>).detail)
  }

  editor.view.dom.addEventListener('contextmenu', domHandler, true)
  window.addEventListener(RS_BLOCK_CONTEXTMENU_PREVIEW_EVENT, previewHandler)
}

function unbindEditorDom() {
  if (boundDom && domHandler) {
    boundDom.removeEventListener('contextmenu', domHandler, true)
  }
  if (previewHandler) {
    window.removeEventListener(RS_BLOCK_CONTEXTMENU_PREVIEW_EVENT, previewHandler)
  }
  boundEditor = null
  boundDom = null
  domHandler = null
  previewHandler = null
}

export function initBlockContextMenu(editor: Editor) {
  if (!isEditorPage()) return

  mountBlockContextMenuHost()
  bindEditorDom(editor)

  if (!(window as Window & { __rsBlockCtxReady?: boolean }).__rsBlockCtxReady) {
    ;(window as Window & { __rsBlockCtxReady?: boolean }).__rsBlockCtxReady = true
    console.log(
      `[rs-block-contextmenu] v${RS_BLOCK_CTX_VER} 已就绪：段落/渲染预览右键 → 块菜单（data-rs-contextmenu=custom 除外）`,
    )
  }
}

export function teardownBlockContextMenu() {
  unbindEditorDom()
  unmountBlockContextMenuHost()
}

export { hasCustomContextMenu, RS_BLOCK_CONTEXTMENU_PREVIEW_EVENT }

import { mountBlockContextMenuHost, unmountBlockContextMenuHost } from '@/editor/block-context-menu-host'
import { Extension, type Editor } from '@halo-dev/richtext-editor'
import { NodeSelection } from '@tiptap/pm/state'

type BlockHit = {
  node: NonNullable<ReturnType<Editor['state']['doc']['nodeAt']>>
  pos: number
}

function findBlockAtCoords(editor: Editor, x: number, y: number): BlockHit | null {
  const coords = editor.view.posAtCoords({ left: x, top: y })
  if (!coords) return null

  const pos = coords.inside >= 0 ? coords.inside : coords.pos
  const $pos = editor.state.doc.resolve(pos)

  for (let d = 1; d <= $pos.depth; d++) {
    const node = $pos.node(d)
    const parent = $pos.node(d - 1)
    if (!node.isBlock) continue
    if (parent.type.name === 'doc') {
      const blockPos = $pos.before(d)
      const blockNode = editor.state.doc.nodeAt(blockPos)
      if (blockNode) return { node: blockNode, pos: blockPos }
    }
  }

  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.isBlock && node.type.name !== 'doc') {
      const blockPos = $pos.before(d)
      const blockNode = editor.state.doc.nodeAt(blockPos)
      if (blockNode) return { node: blockNode, pos: blockPos }
    }
  }

  return null
}

function shouldIgnoreContextTarget(target: Element | null): boolean {
  if (!target) return true
  if (target.closest('textarea, input, select, .cm-editor, .cm-content')) return true
  if (target.closest('.bubble-menu, .v-popper, [data-tippy-root], .rs-wiki-panel')) return true
  if (target.closest('[data-rs-html-fs-overlay], .rs-block-context-menu')) return true
  return false
}

function openBlockContextMenu(editor: Editor, block: BlockHit, x: number, y: number) {
  const { tr, doc } = editor.state
  tr.setMeta('lockDragHandle', true)
  tr.setSelection(NodeSelection.create(doc, block.pos))
  editor.view.dispatch(tr)

  window.dispatchEvent(
    new CustomEvent('rs-block-contextmenu-open', {
      detail: { editor, node: block.node, pos: block.pos, x, y },
    }),
  )
}

const BlockContextMenuExtension = Extension.create({
  name: 'rsBlockContextMenu',

  onCreate() {
    mountBlockContextMenuHost()

    const editor = this.editor
    const onContextMenu = (event: MouseEvent) => {
      if (location.pathname.indexOf('/console/posts/editor') < 0) return
      if (!editor.isEditable) return

      const target = event.target as Element | null
      if (shouldIgnoreContextTarget(target)) return
      if (!target?.closest('.ProseMirror')) return

      const block = findBlockAtCoords(editor, event.clientX, event.clientY)
      if (!block) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      openBlockContextMenu(editor, block, event.clientX, event.clientY)
    }

    document.addEventListener('contextmenu', onContextMenu, true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.storage as any).onContextMenu = onContextMenu
  },

  onDestroy() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (this.storage as any).onContextMenu as ((e: MouseEvent) => void) | undefined
    if (handler) document.removeEventListener('contextmenu', handler, true)
    unmountBlockContextMenuHost()
  },
})

export default BlockContextMenuExtension

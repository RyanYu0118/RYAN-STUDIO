import { Extension, type Editor } from '@halo-dev/richtext-editor'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'

const PLUGIN_KEY = new PluginKey('rsBlockContextMenu')

type BlockHit = { node: { isBlock: boolean; type: { name: string } }; pos: number }

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
      return { node, pos: $pos.before(d) }
    }
  }

  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.isBlock && node.type.name !== 'doc') {
      return { node, pos: $pos.before(d) }
    }
  }

  return null
}

function isDragIndicatorButton(btn: Element): boolean {
  const svg = btn.querySelector('svg')
  if (!svg) return false
  const html = svg.innerHTML
  return (
    html.includes('1.413') ||
    html.includes('drag-indicator') ||
    /-\.587 1\.413/.test(html)
  )
}

/** 点击 Halo EditorDragHandle 的六点按钮，打开块菜单（转换为 / 复制 / 剪切 / 删除） */
function clickDragHandleMenuButton(): boolean {
  const pm = document.querySelector('.ProseMirror')
  if (!pm) return false

  const groups = document.querySelectorAll('.flex.items-center.justify-center.gap-0\\.5')
  for (const group of groups) {
    const btns = group.querySelectorAll(':scope > button')
    if (btns.length < 2) continue
    const menuBtn = btns[1]
    if (isDragIndicatorButton(menuBtn)) {
      ;(menuBtn as HTMLButtonElement).click()
      return true
    }
  }

  const pmRect = pm.getBoundingClientRect()
  for (const btn of document.querySelectorAll('button')) {
    if (!isDragIndicatorButton(btn)) continue
    const r = btn.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    if (r.left <= pmRect.right && r.top >= pmRect.top - 48 && r.top <= pmRect.bottom + 48) {
      ;(btn as HTMLButtonElement).click()
      return true
    }
  }

  return false
}

function openNativeBlockDragMenu(editor: Editor, blockPos: number) {
  const { tr, doc } = editor.state
  tr.setMeta('lockDragHandle', true)
  tr.setSelection(NodeSelection.create(doc, blockPos))
  editor.view.dispatch(tr)

  window.setTimeout(() => {
    if (!clickDragHandleMenuButton()) {
      window.setTimeout(clickDragHandleMenuButton, 80)
    }
  }, 0)
}

function shouldIgnoreContextTarget(target: Element | null): boolean {
  if (!target) return true
  if (target.closest('textarea, input, select, .cm-editor, .cm-content')) return true
  if (target.closest('.bubble-menu, .v-popper, [data-tippy-root], .rs-wiki-panel')) return true
  if (target.closest('[data-rs-html-fs-overlay]')) return true
  return false
}

const BlockContextMenuExtension = Extension.create({
  name: 'rsBlockContextMenu',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: PLUGIN_KEY,
        props: {
          handleDOMEvents: {
            contextmenu(view, event) {
              if (!editor.isEditable) return false

              const target = event.target as Element | null
              if (shouldIgnoreContextTarget(target)) return false
              if (!target?.closest('.ProseMirror')) return false

              const block = findBlockAtCoords(editor, event.clientX, event.clientY)
              if (!block) return false

              event.preventDefault()
              event.stopPropagation()

              openNativeBlockDragMenu(editor, block.pos)
              return true
            },
          },
        },
      }),
    ]
  },
})

export default BlockContextMenuExtension

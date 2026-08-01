import type { Editor } from '@halo-dev/richtext-editor'

const PANEL_VIEWPORT_PAD = 8
/** 底部留白，避免 Windows 任务栏遮挡 */
const PANEL_VIEWPORT_PAD_BOTTOM = 48
const PANEL_GAP = 8

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

export type SelectionAnchor = {
  left: number
  top: number
  width: number
  height: number
  bottom: number
}

/** 当前选区在视口中的矩形（用于面板锚点） */
export function getSelectionAnchorRect(editor: Editor): SelectionAnchor | null {
  const { from, to, empty } = editor.state.selection
  if (empty) return null
  const view = editor.view
  const start = view.coordsAtPos(from)
  const end = view.coordsAtPos(to)
  const left = Math.min(start.left, end.left)
  const right = Math.max(start.right, end.right)
  const top = Math.min(start.top, end.top)
  const bottom = Math.max(start.bottom, end.bottom)
  const width = Math.max(right - left, 1)
  const height = Math.max(bottom - top, 1)
  return { left, top, width, height, bottom }
}

/** 默认在选区正下方；贴近底栏/taskbar 时改到正上方 */
export function clampWikiPanelPosition(
  anchor: SelectionAnchor,
  panelWidth: number,
  panelHeight: number
): { left: number; top: number; placement: 'below' | 'above' } {
  const vv = window.visualViewport
  const viewportLeft = vv?.offsetLeft ?? 0
  const viewportTop = vv?.offsetTop ?? 0
  const viewportWidth = vv?.width ?? window.innerWidth
  const viewportHeight = vv?.height ?? window.innerHeight
  const padBottom = Math.max(PANEL_VIEWPORT_PAD_BOTTOM, readSafeAreaBottom() + 12)

  let left = anchor.left + anchor.width / 2 - panelWidth / 2
  let top = anchor.bottom + PANEL_GAP
  let placement: 'below' | 'above' = 'below'

  if (top + panelHeight + padBottom > viewportTop + viewportHeight) {
    top = anchor.top - panelHeight - PANEL_GAP
    placement = 'above'
  }

  const minLeft = viewportLeft + PANEL_VIEWPORT_PAD
  const minTop = viewportTop + PANEL_VIEWPORT_PAD
  const maxLeft = viewportLeft + viewportWidth - panelWidth - PANEL_VIEWPORT_PAD
  const maxTop = viewportTop + viewportHeight - panelHeight - padBottom

  left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft))
  top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop))

  return { left, top, placement }
}

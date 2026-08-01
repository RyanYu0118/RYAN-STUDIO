/** 渲染实体显式声明自定义右键时，不弹出编辑器块菜单 */
export function hasCustomContextMenu(target: Element | null): boolean {
  let cur: Element | null = target
  while (cur) {
    const mode = cur.getAttribute?.('data-rs-contextmenu')
    if (mode === 'custom' || mode === 'native') return true
    if (cur.hasAttribute?.('oncontextmenu')) return true
    cur = cur.parentElement
  }
  return false
}

export const RS_BLOCK_CONTEXTMENU_PREVIEW_EVENT = 'rs-block-contextmenu-preview'

export type BlockContextMenuPreviewDetail = {
  root: HTMLElement
  clientX: number
  clientY: number
}

import type { Editor } from '@tiptap/core'

/** 气泡菜单项 props，与 Halo BubbleItemComponentProps 对齐，避免在 .vue 中引用 richtext-editor 类型 */
export type WikiBubbleItemProps = {
  editor: Editor
  isActive?: (ctx: { editor: Editor }) => boolean
  visible?: (ctx: { editor: Editor }) => boolean
  action?: unknown
}

import type { Editor } from '@halo-dev/richtext-editor'
import { ExtensionLink } from '@halo-dev/richtext-editor'
import { isWikiArchiveHref } from '@/lib/wiki-utils'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const HANDLE_CLICK_LINK = new PluginKey('handleClickLink')

function isHandleClickLinkPlugin(plugin: Plugin): boolean {
  const k = plugin.spec.key as { key?: string } | string | undefined
  if (!k) return false
  if (typeof k === 'string') return k === 'handleClickLink'
  return k.key === 'handleClickLink'
}

function wikiLinkFromDomEvent(
  view: EditorView,
  event: MouseEvent
): { anchor: HTMLAnchorElement; href: string } | null {
  let anchor: HTMLAnchorElement | null = null
  if (event.target instanceof HTMLAnchorElement) {
    anchor = event.target
  } else if (event.target instanceof Element) {
    anchor = event.target.closest('a')
    if (anchor && !view.dom.contains(anchor)) anchor = null
  }
  if (!anchor) return null
  const href = (anchor.getAttribute('href') || anchor.href || '').trim()
  if (!href || !isWikiArchiveHref(href)) return null
  return { anchor, href }
}

/** 替换 Halo Link 的 handleClickLink：编辑页 Wiki 内链仅编辑/选区，不跳转 */
function createWikiSafeLinkClickPlugin(_editor: Editor): Plugin {
  return new Plugin({
    key: HANDLE_CLICK_LINK,
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (event.button !== 0 || !view.editable) return false
          const hit = wikiLinkFromDomEvent(view, event)
          if (!hit) return false
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            event.stopPropagation()
          }
          return false
        },
        click(view, event) {
          if (event.button !== 0 || !view.editable) return false
          const hit = wikiLinkFromDomEvent(view, event)
          if (!hit) return false
          event.preventDefault()
          event.stopPropagation()
          return true
        },
      },
      handleClick(_view, _pos, event) {
        if (event.button !== 0) return false
        let anchor: HTMLAnchorElement | null = null
        if (event.target instanceof HTMLAnchorElement) {
          anchor = event.target
        } else if (event.target instanceof Element) {
          anchor = event.target.closest('a')
        }
        const href = (anchor?.getAttribute('href') || anchor?.href || '').trim()
        if (!href || !isWikiArchiveHref(href)) return false
        return true
      },
    },
  })
}

/** 覆盖 kit Link：openOnClick=false + 替换 handleClickLink 插件 */
export const WikiEditorLinkOpenPatch = ExtensionLink.extend({
  priority: 1100,
  addOptions() {
    return {
      ...this.parent?.(),
      openOnClick: false,
    }
  },
  addProseMirrorPlugins() {
    const plugins = this.parent?.() ?? []
    return plugins.map((plugin) =>
      isHandleClickLinkPlugin(plugin) ? createWikiSafeLinkClickPlugin(this.editor) : plugin
    )
  },
})

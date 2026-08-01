import type { Editor } from '@halo-dev/richtext-editor'
import { ExtensionLink } from '@halo-dev/richtext-editor'
import { linkInfoAtPos } from '@/lib/wiki-link-commands'
import {
  isDomRedlinkAnchor,
  isEditorPublishedLinkNavEnabled,
} from '@/lib/wiki-editor-nav-policy'
import { openWikiArchiveLinkFromEditor } from '@/lib/wiki-redlink-open'
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

function openPublishedWikiLinkFromEditorDom(
  editor: Editor,
  view: EditorView,
  event: MouseEvent,
  href: string,
  anchor: HTMLAnchorElement
) {
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
  const pos = coords?.pos
  const info = pos != null ? linkInfoAtPos(editor, pos) : null
  void openWikiArchiveLinkFromEditor(editor, {
    href,
    label: info?.label || (anchor.textContent || '').replace(/\s+/g, ' ').trim() || href,
    newTab: true,
    pos,
  })
}

/** 替换 Halo Link 的 handleClickLink：红链仅编辑；蓝链 Ctrl+点击可新标签打开 */
function createWikiSafeLinkClickPlugin(editor: Editor): Plugin {
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

          const modClick = event.ctrlKey || event.metaKey
          if (
            modClick &&
            !isDomRedlinkAnchor(hit.anchor) &&
            isEditorPublishedLinkNavEnabled()
          ) {
            openPublishedWikiLinkFromEditorDom(editor, view, event, hit.href, hit.anchor)
          }
          return true
        },
      },
      handleClick(view, pos, event) {
        if (event.button !== 0 || !view.editable) return false

        let anchor: HTMLAnchorElement | null = null
        if (event.target instanceof HTMLAnchorElement) {
          anchor = event.target
        } else if (event.target instanceof Element) {
          anchor = event.target.closest('a')
          if (anchor && !view.dom.contains(anchor)) anchor = null
        }

        const hrefFromDom = (anchor?.getAttribute('href') || anchor?.href || '').trim()
        const info = linkInfoAtPos(editor, pos)
        const href = hrefFromDom || info?.href || ''
        if (!href || !isWikiArchiveHref(href)) return false

        const modClick = event.ctrlKey || event.metaKey
        if (
          modClick &&
          anchor &&
          !isDomRedlinkAnchor(anchor) &&
          isEditorPublishedLinkNavEnabled()
        ) {
          event.preventDefault()
          void openWikiArchiveLinkFromEditor(editor, {
            href,
            label: info?.label || (anchor.textContent || '').replace(/\s+/g, ' ').trim() || href,
            newTab: true,
            pos,
          })
          return true
        }

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

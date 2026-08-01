import type { Editor } from '@halo-dev/richtext-editor'
import { ExtensionLink } from '@halo-dev/richtext-editor'
import { linkInfoAtPos } from '@/lib/wiki-link-commands'
import { openWikiArchiveLinkFromEditor } from '@/lib/wiki-redlink-open'
import { isWikiArchiveHref } from '@/lib/wiki-utils'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const HANDLE_CLICK_LINK = new PluginKey('handleClickLink')

function isHandleClickLinkPlugin(plugin: Plugin): boolean {
  const k = plugin.spec.key as { key?: string } | string | undefined
  if (!k) return false
  if (typeof k === 'string') return k === 'handleClickLink'
  return k.key === 'handleClickLink'
}

/** 替换 Halo Link 的 handleClickLink：Wiki 内链禁止一点就 window.open(_self) */
function createWikiSafeLinkClickPlugin(editor: Editor): Plugin {
  return new Plugin({
    key: HANDLE_CLICK_LINK,
    props: {
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
        if (modClick) {
          event.preventDefault()
          void openWikiArchiveLinkFromEditor(editor, {
            href,
            label: info?.label || (anchor?.textContent || '').replace(/\s+/g, ' ').trim() || href,
            newTab: true,
          })
          return true
        }

        // 普通左键：吞掉 Link openOnClick，不导航（选区由 mousedown 处理）
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

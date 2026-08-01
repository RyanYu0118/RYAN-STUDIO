import WikiLinkBubbleButton from '@/components/WikiLinkBubbleButton.vue'
import {
  mountWikiLinkFloatingHost,
  unmountWikiLinkFloatingHost,
} from '@/editor/wiki-link-floating-host'
import {
  bindNativeOpenLinkBridge,
  setWikiLinkEditor,
  unbindNativeOpenLinkBridge,
} from '@/lib/wiki-native-open-link-bridge'
import {
  bindWikiEditorCtrlCursor,
  unbindWikiEditorCtrlCursor,
} from '@/lib/wiki-editor-ctrl-cursor'
import { linkInfoAtPos } from '@/lib/wiki-link-commands'
import { openWikiArchiveLinkFromEditor } from '@/lib/wiki-redlink-open'
import { isWikiArchiveHref } from '@/lib/wiki-utils'
import { Extension, ExtensionLink, TEXT_BUBBLE_MENU_KEY, type Editor } from '@halo-dev/richtext-editor'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { markRaw } from 'vue'

const WikiLinkExtension = Extension.create({
  name: 'rsWikiLink',
  /** 高于 Link(1000)，handleClick 先于 Halo openOnClick 执行 */
  priority: 1001,

  onCreate() {
    mountWikiLinkFloatingHost()
    setWikiLinkEditor(this.editor)
    bindNativeOpenLinkBridge(this.editor)
    bindWikiEditorCtrlCursor()
  },

  onDestroy() {
    unmountWikiLinkFloatingHost()
    unbindNativeOpenLinkBridge()
    unbindWikiEditorCtrlCursor()
    setWikiLinkEditor(null)
  },

  onSelectionUpdate() {
    setWikiLinkEditor(this.editor)
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('rsWikiLinkEditorClick'),
        props: {
          handleClick(_view, pos, event) {
            if (event.button !== 0) return false
            const info = linkInfoAtPos(editor, pos)
            if (!info || !isWikiArchiveHref(info.href)) return false

            const modClick = event.ctrlKey || event.metaKey

            if (modClick) {
              event.preventDefault()
              void openWikiArchiveLinkFromEditor(editor, {
                href: info.href,
                label: info.label,
                newTab: true,
              })
              return true
            }

            if (info.isRed) {
              editor.commands.extendMarkRange(ExtensionLink.name)
              return true
            }

            return false
          },
        },
      }),
    ]
  },

  addOptions() {
    return {
      getBubbleMenu({ editor }: { editor: Editor }) {
        return {
          extendsKey: TEXT_BUBBLE_MENU_KEY,
          items: [
            {
              priority: 118,
              component: markRaw(WikiLinkBubbleButton),
              props: {
                editor,
                visible: ({ editor: ed }: { editor: Editor }) => !ed.state.selection.empty,
              },
            },
          ],
        }
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-k': () => {
        if (this.editor.state.selection.empty) return false
        window.dispatchEvent(
          new CustomEvent('rs-wikilink-open', { detail: { editor: this.editor } })
        )
        return true
      },
    }
  },
})

export default WikiLinkExtension

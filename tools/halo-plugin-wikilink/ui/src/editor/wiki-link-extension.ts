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
import { Extension, ExtensionLink, TEXT_BUBBLE_MENU_KEY, type Editor } from '@halo-dev/richtext-editor'
import { Plugin } from '@tiptap/pm/state'
import { markRaw } from 'vue'
import { openWikiArchiveLinkFromEditor } from '@/lib/wiki-redlink-open'
import { isWikiArchiveHref } from '@/lib/wiki-utils'

const WikiLinkExtension = Extension.create({
  name: 'rsWikiLink',

  onCreate() {
    mountWikiLinkFloatingHost()
    setWikiLinkEditor(this.editor)
    bindNativeOpenLinkBridge(this.editor)
  },

  onDestroy() {
    unmountWikiLinkFloatingHost()
    unbindNativeOpenLinkBridge()
    setWikiLinkEditor(null)
  },

  onSelectionUpdate() {
    setWikiLinkEditor(this.editor)
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handleClick: (_view, pos, event) => {
            if (!(event.ctrlKey || event.metaKey)) return false
            const { doc } = editor.state
            const $pos = doc.resolve(pos)
            let href = ''
            for (const mark of $pos.marks()) {
              if (mark.type.name === ExtensionLink.name && mark.attrs.href) {
                href = String(mark.attrs.href).trim()
                break
              }
            }
            if (!href || !isWikiArchiveHref(href)) return false
            event.preventDefault()
            void openWikiArchiveLinkFromEditor(editor, { href, newTab: true })
            return true
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

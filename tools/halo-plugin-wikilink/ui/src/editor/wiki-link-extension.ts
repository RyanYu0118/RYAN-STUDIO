import WikiLinkBubbleButton from '@/components/WikiLinkBubbleButton.vue'
import {
  mountWikiLinkFloatingHost,
  unmountWikiLinkFloatingHost,
} from '@/editor/wiki-link-floating-host'
import { Extension, TEXT_BUBBLE_MENU_KEY, type Editor } from '@halo-dev/richtext-editor'
import { markRaw } from 'vue'

const WikiLinkExtension = Extension.create({
  name: 'rsWikiLink',

  onCreate() {
    mountWikiLinkFloatingHost()
  },

  onDestroy() {
    unmountWikiLinkFloatingHost()
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

import WikiLinkBubbleButton from '@/components/WikiLinkBubbleButton.vue'
import { Extension, TEXT_BUBBLE_MENU_KEY, type Editor } from '@halo-dev/richtext-editor'
import { markRaw } from 'vue'

const WikiLinkExtension = Extension.create({
  name: 'mcwwsWikiLink',

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
        window.dispatchEvent(new CustomEvent('mcwws-wikilink-open'))
        return true
      },
    }
  },
})

export default WikiLinkExtension

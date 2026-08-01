import { initBlockContextMenu, teardownBlockContextMenu } from '@/editor/block-context-menu-bridge'
import { Extension } from '@halo-dev/richtext-editor'

const BlockContextMenuExtension = Extension.create({
  name: 'rsBlockContextMenu',

  onCreate() {
    initBlockContextMenu(this.editor)
  },

  onDestroy() {
    teardownBlockContextMenu()
  },
})

export default BlockContextMenuExtension

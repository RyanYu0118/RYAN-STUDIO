import { bootHtmlBlockCompact, scheduleRepairDebounced, teardownHtmlBlockCompact } from '@/html-block/init'
import { teardownBlockContextMenu } from '@/editor/block-context-menu-bridge'
import { Extension } from '@halo-dev/richtext-editor'

const HtmlBlockCompactExtension = Extension.create({
  name: 'rsHtmlBlockCompact',

  onCreate() {
    bootHtmlBlockCompact(this.editor)
  },

  onUpdate() {
    scheduleRepairDebounced()
  },

  onDestroy() {
    teardownHtmlBlockCompact()
    teardownBlockContextMenu()
  },
})

export default HtmlBlockCompactExtension

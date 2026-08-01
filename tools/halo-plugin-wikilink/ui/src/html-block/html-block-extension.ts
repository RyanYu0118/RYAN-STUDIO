import { bootHtmlBlockCompact, scheduleRepairDebounced, teardownHtmlBlockCompact } from '@/html-block/init'
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
  },
})

export default HtmlBlockCompactExtension

import { definePlugin } from '@halo-dev/ui-shared'
import '@/styles/wiki-editor.css'

export default definePlugin({
  components: {},
  routes: [],
  extensionPoints: {
    'default:editor:extension:create': async () => {
      const { WikiLinkExtension } = await import('./editor')
      return [WikiLinkExtension]
    },
  },
})

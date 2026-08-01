import BlockContextMenuLayer from '@/components/BlockContextMenuLayer.vue'
import { createApp, type App } from 'vue'

let app: App | null = null

export function mountBlockContextMenuHost() {
  if (app) return
  if (location.pathname.indexOf('/console/posts/editor') < 0) return

  const root = document.createElement('div')
  root.id = 'rs-block-context-menu-root'
  document.body.appendChild(root)
  app = createApp(BlockContextMenuLayer)
  app.mount(root)
}

export function unmountBlockContextMenuHost() {
  app?.unmount()
  app = null
  document.getElementById('rs-block-context-menu-root')?.remove()
}

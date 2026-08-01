import BlockContextMenuLayer from '@/components/BlockContextMenuLayer.vue'
import { createApp, type App } from 'vue'

let app: App | null = null

function inheritHaloAppContext(app: App) {
  const haloApp = (document.querySelector('#app') as HTMLElement & { __vue_app__?: App })?.__vue_app__
  if (!haloApp) return
  Object.assign(app.config.globalProperties, haloApp.config.globalProperties)
  Object.assign(app._context.provides, haloApp._context.provides)
}

export function mountBlockContextMenuHost() {
  if (app) return

  const root = document.createElement('div')
  root.id = 'rs-block-context-menu-root'
  document.body.appendChild(root)
  app = createApp(BlockContextMenuLayer)
  inheritHaloAppContext(app)
  app.mount(root)
}

export function unmountBlockContextMenuHost() {
  app?.unmount()
  app = null
  document.getElementById('rs-block-context-menu-root')?.remove()
  ;(window as Window & { __rsBlockCtxReady?: boolean }).__rsBlockCtxReady = false
}

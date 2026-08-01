import WikiLinkFloatingLayer from '@/components/WikiLinkFloatingLayer.vue'
import { createApp, type App } from 'vue'

let app: App | null = null

function inheritHaloAppContext(app: App) {
  const haloApp = (document.querySelector('#app') as HTMLElement & { __vue_app__?: App })?.__vue_app__
  if (!haloApp) return
  Object.assign(app.config.globalProperties, haloApp.config.globalProperties)
  Object.assign(app._context.provides, haloApp._context.provides)
}

export function mountWikiLinkFloatingHost() {
  if (app) return
  const root = document.createElement('div')
  root.id = 'rs-wiki-link-float-root'
  document.body.appendChild(root)
  app = createApp(WikiLinkFloatingLayer)
  inheritHaloAppContext(app)
  app.mount(root)
}

export function unmountWikiLinkFloatingHost() {
  app?.unmount()
  app = null
  document.getElementById('rs-wiki-link-float-root')?.remove()
}

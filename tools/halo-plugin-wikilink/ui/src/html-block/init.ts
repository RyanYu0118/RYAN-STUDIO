import type { Editor } from '@tiptap/core'

import './compact.runtime.js'

const DEFAULT_HTML_BLOCK_CFG = {
  enabled: true,
  labelRe: null as RegExp | null,
  types: ['html_edited'],
  previewStyles: ['/upload/wiki-data/fronts.css'],
  previewDocClass: 'my-wiki-page markdown-body',
  previewSandbox: 'allow-scripts allow-same-origin',
  autoRepairFromServer: true,
  repairMinDiff: 64,
  showRepairButton: true,
  repairSnippets: {
    'wd-smart-card': '/upload/wiki-data/snippets/wander-card-block.snippet.html',
  },
}

declare global {
  interface Window {
    __rsHtmlBlockEditor?: Editor
    __rsHtmlBlockPluginMode?: boolean
    RSConfig?: {
      htmlBlockCompact?: typeof DEFAULT_HTML_BLOCK_CFG & { enabled?: boolean }
    }
    RSHtmlBlockCompact?: {
      init?: () => boolean
      repairNow?: () => void
      scheduleRepair?: () => void
      getBlockRoots?: () => Element[]
      __ver?: string
    }
  }
}

let bootTimers: ReturnType<typeof setTimeout>[] = []
let repairTimer: ReturnType<typeof setTimeout> | null = null

function ensureConfig() {
  window.RSConfig = window.RSConfig || {}
  if (!window.RSConfig.htmlBlockCompact) {
    window.RSConfig.htmlBlockCompact = { ...DEFAULT_HTML_BLOCK_CFG }
  }
}

function clearBootTimers() {
  bootTimers.forEach((t) => clearTimeout(t))
  bootTimers = []
}

export function bootHtmlBlockCompact(editor: Editor) {
  if (location.pathname.indexOf('/console/posts/editor') < 0) return

  window.__rsHtmlBlockPluginMode = true
  window.__rsHtmlBlockEditor = editor
  ensureConfig()

  if (window.RSConfig?.htmlBlockCompact?.enabled === false) return

  clearBootTimers()
  window.RSHtmlBlockCompact?.init?.()

  const delays = [0, 50, 150, 350, 700, 1200, 2500, 5000, 8000, 12000, 20000]
  bootTimers = delays.map((ms) =>
    setTimeout(() => {
      window.RSHtmlBlockCompact?.init?.()
    }, ms)
  )
}

export function scheduleRepairDebounced() {
  if (repairTimer) clearTimeout(repairTimer)
  repairTimer = setTimeout(() => {
    repairTimer = null
    window.RSHtmlBlockCompact?.scheduleRepair?.()
  }, 800)
}

export function teardownHtmlBlockCompact() {
  clearBootTimers()
  if (repairTimer) {
    clearTimeout(repairTimer)
    repairTimer = null
  }
  window.__rsHtmlBlockEditor = undefined
}

/** 须在 compact.runtime.js 之前加载，避免 rs-config 的 enabled:false 与注入版逻辑冲突 */
if (typeof window !== 'undefined') {
  window.__rsHtmlBlockPluginMode = true
}

declare global {
  interface Window {
    __rsHtmlBlockPluginMode?: boolean
  }
}

export {}

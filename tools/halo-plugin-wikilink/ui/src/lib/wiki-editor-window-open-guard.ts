import { isWikiArchiveHref } from '@/lib/wiki-utils'

let patched = false
let nativeOpen: typeof window.open | null = null

function isEditorPage() {
  return location.pathname.indexOf('/console/posts/editor') >= 0
}

/** 编辑页拦截 Halo Link 的 window.open(href, '_self')，避免红链覆盖当前页 404 */
export function bindWikiEditorWindowOpenGuard() {
  if (patched || typeof window === 'undefined') return
  patched = true
  nativeOpen = window.open.bind(window)

  window.open = function (url?: string | URL, target?: string, features?: string) {
    const href = String(url ?? '')
    if (
      isEditorPage() &&
      isWikiArchiveHref(href) &&
      (!target || target === '_self' || target === 'self')
    ) {
      return null
    }
    return nativeOpen!(url, target, features)
  }
}

export function unbindWikiEditorWindowOpenGuard() {
  if (!patched || !nativeOpen) return
  window.open = nativeOpen
  nativeOpen = null
  patched = false
}

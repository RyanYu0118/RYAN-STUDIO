import type { Editor } from '@halo-dev/richtext-editor'
import { ExtensionLink } from '@halo-dev/richtext-editor'
import { openWikiArchiveLinkFromEditor } from '@/lib/wiki-redlink-open'
import { isExternalUrl } from '@/lib/wiki-utils'

function isWikiArchiveHref(href: string): boolean {
  if (!href || isExternalUrl(href)) return false
  const path = href.replace(/^https?:\/\/[^/]+/i, '')
  return path.startsWith('/archives/') || path.includes('/archives/')
}

const OPEN_LINK_TITLE = /^打开链接$|^open link$/i
const LINK_PANEL_HINT =
  /取消链接|打开链接|在新窗口|普通链接|链接地址|link address|enter the link/i

let activeEditor: Editor | null = null
let observer: MutationObserver | null = null
const patched = new WeakSet<HTMLButtonElement>()

export function setWikiLinkEditor(editor: Editor | null) {
  activeEditor = editor
}

function isEditorPage() {
  return location.pathname.indexOf('/console/posts/editor') >= 0
}

/** Halo 文本气泡栏 / 链接卡片里的原生「打开链接」按钮 */
export function isNativeOpenLinkButton(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  const btn = el.closest('button')
  if (!btn || !(btn instanceof HTMLButtonElement)) return false

  const title = (btn.getAttribute('title') || '').trim()
  if (OPEN_LINK_TITLE.test(title)) return true

  const aria = (btn.getAttribute('aria-label') || '').trim()
  if (OPEN_LINK_TITLE.test(aria)) return true

  const text = (btn.textContent || '').replace(/\s+/g, ' ').trim()
  if (OPEN_LINK_TITLE.test(text)) return true

  return false
}

function isInsideLinkPanel(btn: HTMLButtonElement): boolean {
  const panel =
    btn.closest('.bubble-menu') ||
    btn.closest('.v-popper__inner') ||
    btn.closest('[data-tippy-root]') ||
    btn.closest('[class*="w-96"]')
  if (!panel) return false
  return LINK_PANEL_HINT.test(panel.textContent || '')
}

function patchOpenLinkButton(btn: HTMLButtonElement) {
  if (patched.has(btn)) return
  if (!isInsideLinkPanel(btn) && !OPEN_LINK_TITLE.test(btn.getAttribute('title') || '')) return
  patched.add(btn)

  btn.addEventListener(
    'click',
    (e) => {
      const ed = activeEditor
      if (!ed || !isEditorPage()) return

      const href = String(ed.getAttributes(ExtensionLink.name).href || '').trim()
      if (!href || !isWikiArchiveHref(href)) return

      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      void openWikiArchiveLinkFromEditor(ed, { shiftKey: e.shiftKey, href })
    },
    true
  )
}

function scanAndPatchOpenLinkButtons(root: ParentNode = document) {
  root.querySelectorAll('button[title="打开链接"], button[title="Open link"]').forEach((el) => {
    if (el instanceof HTMLButtonElement) patchOpenLinkButton(el)
  })
}

export function bindNativeOpenLinkBridge(editor: Editor) {
  activeEditor = editor
  if (observer) return

  scanAndPatchOpenLinkButtons()

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scanAndPatchOpenLinkButtons(node)
          else if (node instanceof DocumentFragment) scanAndPatchOpenLinkButtons(node)
        })
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

export function unbindNativeOpenLinkBridge() {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  activeEditor = null
}

import type { Editor } from '@halo-dev/richtext-editor'
import {
  getActiveWikiLinkInfo,
  getWikiLinkInfoFromHref,
  hrefAtEditorSelection,
} from '@/lib/wiki-link-commands'
import {
  canOpenWikiLinkFromEditor,
  isDomRedlinkAnchor,
  isEditorConsolePage,
  isEditorPublishedLinkNavEnabled,
  shouldBlockEditorWikiLinkClick,
} from '@/lib/wiki-editor-nav-policy'
import { openWikiArchiveLinkFromEditor } from '@/lib/wiki-redlink-open'
import { isWikiArchiveHref } from '@/lib/wiki-utils'

const OPEN_LINK_LABEL = /^(打开链接|open link)$/i
const OPEN_LINK_ICON_MARK = 'zm10.513'

let activeEditor: Editor | null = null
let cachedHref = ''
let cachedLabel = ''
let cachedAt = 0
let pendingCtrlWikiLink: { href: string; label: string } | null = null

type ListenerPair = {
  mousedown: (e: MouseEvent) => void
  click: (e: MouseEvent) => void
  editorLinkClick: (e: MouseEvent) => void
  editorLinkNavBlock: (e: MouseEvent) => void
}
let docListeners: ListenerPair | null = null

export function setWikiLinkEditor(editor: Editor | null) {
  activeEditor = editor
}

function wikiAnchorFromEvent(e: MouseEvent): HTMLAnchorElement | null {
  if (!(e.target instanceof Element)) return null
  const anchor = e.target.closest('.ProseMirror a[href]')
  return anchor instanceof HTMLAnchorElement ? anchor : null
}

function linkControlLabel(btn: HTMLButtonElement): string {
  return (
    btn.getAttribute('aria-label') ||
    btn.getAttribute('title') ||
    btn.getAttribute('data-tooltip') ||
    btn.getAttribute('data-tip') ||
    btn.textContent ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function buttonHasUnlinkIcon(btn: HTMLButtonElement): boolean {
  const svg = btn.querySelector('svg')
  if (!svg) return false
  const inner = (svg.innerHTML || '') + (svg.outerHTML || '')
  return inner.includes('10.232') || inner.includes('unsetLink') || inner.includes('8 17a1')
}

function buttonHasOpenLinkIcon(btn: HTMLButtonElement): boolean {
  const svg = btn.querySelector('svg')
  if (!svg) return false
  const inner = (svg.innerHTML || '') + (svg.outerHTML || '')
  return inner.includes(OPEN_LINK_ICON_MARK) || inner.includes('mingcute-share-3')
}

function posFromMouseEvent(ed: Editor, e: MouseEvent): number | undefined {
  const hit = ed.view.posAtCoords({ left: e.clientX, top: e.clientY })
  return hit?.pos
}

function cacheLinkFromAnchor(anchor: HTMLAnchorElement) {
  const href = (anchor.getAttribute('href') || '').trim()
  if (!href || !isWikiArchiveHref(href)) return
  cachedHref = href
  cachedLabel = (anchor.textContent || '').replace(/\s+/g, ' ').trim()
  cachedAt = Date.now()
}

function findLinkHrefInPanel(): string {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    '.bubble-menu input, .v-popper--shown input, [data-tippy-root] input, [class*="w-96"] input'
  )
  for (const input of inputs) {
    const v = input.value.trim()
    if (v && isWikiArchiveHref(v)) return v
  }
  return ''
}

function resolveWikiHref(ed: Editor): string {
  const fromState = hrefAtEditorSelection(ed)
  if (fromState && isWikiArchiveHref(fromState)) return fromState

  const fromPanel = findLinkHrefInPanel()
  if (fromPanel) return fromPanel

  if (cachedHref && Date.now() - cachedAt < 120_000 && isWikiArchiveHref(cachedHref)) {
    return cachedHref
  }

  ed.commands.extendMarkRange('link')
  const afterExtend = hrefAtEditorSelection(ed)
  if (afterExtend && isWikiArchiveHref(afterExtend)) return afterExtend

  const fromAttrs = String(ed.getAttributes('link').href || '').trim()
  if (fromAttrs && isWikiArchiveHref(fromAttrs)) return fromAttrs

  return ''
}

function resolveWikiLabel(ed: Editor, href: string): string {
  const { from, to } = ed.state.selection
  if (to > from) {
    const text = ed.state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  if (cachedHref === href && cachedLabel) return cachedLabel
  return href
}

function wikiLinkIsRed(ed: Editor, href: string): boolean {
  const info = getActiveWikiLinkInfo(ed) || getWikiLinkInfoFromHref(ed, href)
  return info.isRed
}

function handleEditorWikiLinkMousedown(e: MouseEvent) {
  if (!isEditorConsolePage() || e.button !== 0) return
  const anchor = wikiAnchorFromEvent(e)
  if (!anchor) {
    pendingCtrlWikiLink = null
    return
  }

  const href = (anchor.getAttribute('href') || '').trim()
  if (!isWikiArchiveHref(href)) {
    pendingCtrlWikiLink = null
    return
  }

  const modClick = e.ctrlKey || e.metaKey
  if (modClick) {
    e.preventDefault()
    e.stopPropagation()
    pendingCtrlWikiLink = {
      href,
      label: (anchor.textContent || '').replace(/\s+/g, ' ').trim() || href,
    }
    return
  }

  pendingCtrlWikiLink = null
}

function handleEditorWikiLinkNavBlock(e: MouseEvent) {
  if (!isEditorConsolePage() || e.button !== 0) return

  const anchor = wikiAnchorFromEvent(e)
  if (!anchor) return
  const href = (anchor.getAttribute('href') || '').trim()
  if (!isWikiArchiveHref(href)) return

  const modClick = e.ctrlKey || e.metaKey
  if (!shouldBlockEditorWikiLinkClick(anchor, modClick)) return

  e.preventDefault()
  if (modClick && isDomRedlinkAnchor(anchor)) {
    e.stopPropagation()
    e.stopImmediatePropagation()
  }
}

function handleEditorWikiLinkClick(e: MouseEvent) {
  if (!isEditorConsolePage() || e.button !== 0) return
  if (!(e.ctrlKey || e.metaKey)) return
  if (!isEditorPublishedLinkNavEnabled()) return

  const pending = pendingCtrlWikiLink
  pendingCtrlWikiLink = null

  const anchor = wikiAnchorFromEvent(e)
  const href = (pending?.href || anchor?.getAttribute('href') || '').trim()
  if (!href || !isWikiArchiveHref(href)) return
  if (anchor && isDomRedlinkAnchor(anchor)) return

  const ed = activeEditor
  if (!ed) return

  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()

  const label =
    pending?.label ||
    (anchor?.textContent || '').replace(/\s+/g, ' ').trim() ||
    href
  const pos = posFromMouseEvent(ed, e)
  void openWikiArchiveLinkFromEditor(ed, { href, label, newTab: true, pos })
}

export function isNativeOpenLinkButton(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false
  const btn = el.closest('button')
  if (!btn || !(btn instanceof HTMLButtonElement)) return false
  if (buttonHasUnlinkIcon(btn)) return false

  const label = linkControlLabel(btn)
  if (OPEN_LINK_LABEL.test(label)) return true

  const inBubble = !!(btn.closest('.bubble-menu') || btn.closest('.v-popper__inner'))
  if (inBubble && buttonHasOpenLinkIcon(btn)) return true

  return false
}

function handleOpenLinkClick(e: MouseEvent) {
  if (!isNativeOpenLinkButton(e.target)) return
  const ed = activeEditor
  if (!ed || !isEditorConsolePage()) return

  const href = resolveWikiHref(ed)
  if (!href || !isWikiArchiveHref(href)) return

  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()

  if (!isEditorPublishedLinkNavEnabled()) return
  if (!canOpenWikiLinkFromEditor(wikiLinkIsRed(ed, href))) return

  const label = resolveWikiLabel(ed, href)
  void openWikiArchiveLinkFromEditor(ed, {
    href,
    label,
    newTab: true,
  })
}

function handleOpenLinkMousedown(e: MouseEvent) {
  const anchor = wikiAnchorFromEvent(e)
  if (anchor) {
    cacheLinkFromAnchor(anchor)
  } else if (activeEditor) {
    const href = hrefAtEditorSelection(activeEditor)
    if (href && isWikiArchiveHref(href)) {
      cachedHref = href
      const { from, to } = activeEditor.state.selection
      if (to > from) {
        cachedLabel = activeEditor.state.doc
          .textBetween(from, to, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
      cachedAt = Date.now()
    }
  }
  if (e.target instanceof Element && e.target.closest('.bubble-menu, .v-popper__inner')) {
    if (activeEditor) {
      const href = hrefAtEditorSelection(activeEditor)
      if (href && isWikiArchiveHref(href)) {
        cachedHref = href
        cachedAt = Date.now()
      }
    }
  }
  handleEditorWikiLinkMousedown(e)
}

function ensureDocumentListeners() {
  if (docListeners) return

  const mousedown = (e: MouseEvent) => handleOpenLinkMousedown(e)
  const click = (e: MouseEvent) => handleOpenLinkClick(e)
  const editorLinkClick = (e: MouseEvent) => handleEditorWikiLinkClick(e)
  const editorLinkNavBlock = (e: MouseEvent) => handleEditorWikiLinkNavBlock(e)

  document.addEventListener('mousedown', mousedown, true)
  document.addEventListener('click', editorLinkClick, true)
  document.addEventListener('click', editorLinkNavBlock, true)
  document.addEventListener('click', click, true)
  docListeners = { mousedown, click, editorLinkClick, editorLinkNavBlock }
}

export function bindNativeOpenLinkBridge(editor: Editor) {
  activeEditor = editor
  const href = hrefAtEditorSelection(editor)
  if (href && isWikiArchiveHref(href)) {
    cachedHref = href
    cachedAt = Date.now()
  }
  ensureDocumentListeners()
}

export function unbindNativeOpenLinkBridge() {
  if (docListeners) {
    document.removeEventListener('mousedown', docListeners.mousedown, true)
    document.removeEventListener('click', docListeners.editorLinkClick, true)
    document.removeEventListener('click', docListeners.editorLinkNavBlock, true)
    document.removeEventListener('click', docListeners.click, true)
    docListeners = null
  }
  activeEditor = null
  cachedHref = ''
  cachedLabel = ''
  cachedAt = 0
  pendingCtrlWikiLink = null
}

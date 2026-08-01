import type { Editor } from '@halo-dev/richtext-editor'
import { hrefAtEditorSelection, labelAtEditorSelection } from '@/lib/wiki-link-commands'
import { openWikiArchiveLinkFromEditor } from '@/lib/wiki-redlink-open'
import { isWikiArchiveHref } from '@/lib/wiki-utils'

const OPEN_LINK_LABEL = /^(打开链接|open link)$/i
/** Halo 文本气泡「打开链接」图标 mingcute-share-3-line */
const OPEN_LINK_ICON_MARK = 'zm10.513'

let activeEditor: Editor | null = null
let cachedHref = ''
let cachedLabel = ''
let cachedAt = 0

type ListenerPair = { mousedown: (e: MouseEvent) => void; click: (e: MouseEvent) => void }
let docListeners: ListenerPair | null = null

export function setWikiLinkEditor(editor: Editor | null) {
  activeEditor = editor
}

function isEditorPage() {
  return location.pathname.indexOf('/console/posts/editor') >= 0
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

function cacheLinkFromEditor(ed: Editor) {
  const href = hrefAtEditorSelection(ed)
  if (!href || !isWikiArchiveHref(href)) return
  cachedHref = href
  const { from, to } = ed.state.selection
  if (to > from) {
    cachedLabel = ed.state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim()
  }
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
  const fromSel = labelAtEditorSelection(ed, '')
  if (fromSel) return fromSel
  if (cachedHref === href && cachedLabel) return cachedLabel
  return href
}

/** Halo 文本气泡栏 / 链接面板里的原生「打开链接」按钮（v-tooltip 常不写 title） */
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
  if (!ed || !isEditorPage()) return

  const href = resolveWikiHref(ed)
  if (!href || !isWikiArchiveHref(href)) return

  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()

  const label = resolveWikiLabel(ed, href)
  void openWikiArchiveLinkFromEditor(ed, {
    shiftKey: e.shiftKey,
    href,
    label,
  })
}

function handleOpenLinkMousedown(e: MouseEvent) {
  if (activeEditor) cacheLinkFromEditor(activeEditor)
  if (e.target instanceof Element && e.target.closest('.bubble-menu, .v-popper__inner')) {
    if (activeEditor) cacheLinkFromEditor(activeEditor)
  }
}

function ensureDocumentListeners() {
  if (docListeners) return

  const mousedown = (e: MouseEvent) => handleOpenLinkMousedown(e)
  const click = (e: MouseEvent) => handleOpenLinkClick(e)

  document.addEventListener('mousedown', mousedown, true)
  document.addEventListener('click', click, true)
  docListeners = { mousedown, click }
}

export function bindNativeOpenLinkBridge(editor: Editor) {
  activeEditor = editor
  cacheLinkFromEditor(editor)
  ensureDocumentListeners()
}

export function unbindNativeOpenLinkBridge() {
  if (docListeners) {
    document.removeEventListener('mousedown', docListeners.mousedown, true)
    document.removeEventListener('click', docListeners.click, true)
    docListeners = null
  }
  activeEditor = null
  cachedHref = ''
  cachedLabel = ''
  cachedAt = 0
}

import type { Editor } from '@halo-dev/richtext-editor'
import { ExtensionLink } from '@halo-dev/richtext-editor'
import type { Transaction } from '@tiptap/pm/state'
import { checkLinkTarget } from '@/lib/wiki-redlink-open'
import { EDITOR_WIKI_REDLINK_TITLE } from '@/lib/wiki-editor-nav-policy'
import { reloadWikiIndex } from '@/lib/wiki-index'
import { archivesHref, isWikiArchiveHref, normalizeTarget } from '@/lib/wiki-utils'

const REDLINK_TITLE = EDITOR_WIKI_REDLINK_TITLE
const POLL_MS = 45_000
const SYNC_META_KEY = 'rsWikiLinkClassSync'

type LinkClassPlan =
  | { kind: 'published'; postSlug: string }
  | { kind: 'red' }

function collectWikiLinkTargets(editor: Editor): Set<string> {
  const targets = new Set<string>()
  editor.state.doc.descendants((node) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type.name !== ExtensionLink.name) continue
      const href = String(mark.attrs.href || '')
      if (!isWikiArchiveHref(href)) continue
      const target = normalizeTarget(href)
      if (target) targets.add(target)
    }
  })
  return targets
}

function findEditorScrollEl(dom: HTMLElement): HTMLElement {
  let el: HTMLElement | null = dom
  while (el) {
    const oy = getComputedStyle(el).overflowY
    if (/(auto|scroll|overlay)/.test(oy) && el.scrollHeight > el.clientHeight + 1) {
      return el
    }
    el = el.parentElement
  }
  return dom
}

function markNeedsUpdate(
  mark: { attrs: Record<string, unknown> },
  plan: LinkClassPlan
): Record<string, unknown> | null {
  const href = String(mark.attrs.href || '')
  const hasRed = String(mark.attrs.class || '').includes('rs-wiki-redlink')

  if (plan.kind === 'published') {
    const wantHref = archivesHref(plan.postSlug)
    if (!hasRed && href === wantHref) return null
    return {
      ...mark.attrs,
      href: wantHref,
      class: null,
      title: null,
    }
  }

  const wantHref = archivesHref(normalizeTarget(href))
  if (hasRed && href === wantHref) return null
  return {
    ...mark.attrs,
    href: wantHref,
    class: 'rs-wiki-redlink',
    target: '_self',
    title: REDLINK_TITLE,
  }
}

function buildLinkClassTransaction(
  editor: Editor,
  plans: Map<string, LinkClassPlan>
): Transaction | null {
  const linkType = editor.schema.marks[ExtensionLink.name]
  if (!linkType || !plans.size) return null

  let tr = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type !== linkType) continue
      const href = String(mark.attrs.href || '')
      if (!href || !isWikiArchiveHref(href)) continue
      const target = normalizeTarget(href)
      const plan = plans.get(target)
      if (!plan) continue

      const nextAttrs = markNeedsUpdate(mark, plan)
      if (!nextAttrs) continue

      tr = tr.removeMark(pos, pos + node.nodeSize, linkType)
      tr = tr.addMark(pos, pos + node.nodeSize, linkType.create(nextAttrs))
      changed = true
    }
  })

  if (!changed) return null
  return tr.setMeta('addToHistory', false).setMeta(SYNC_META_KEY, true)
}

function dispatchClassSyncTransaction(editor: Editor, tr: Transaction | null): boolean {
  if (!tr) return false

  const scrollEl = findEditorScrollEl(editor.view.dom)
  const scrollTop = scrollEl.scrollTop
  const scrollLeft = scrollEl.scrollLeft

  editor.view.dispatch(tr)

  requestAnimationFrame(() => {
    scrollEl.scrollTop = scrollTop
    scrollEl.scrollLeft = scrollLeft
  })
  return true
}

/** 逐条 API 校验后一次性更新 mark，避免多次 dispatch 打断滚动 */
export async function refreshWikiLinkClassesFromApi(editor: Editor): Promise<boolean> {
  const targets = collectWikiLinkTargets(editor)
  if (!targets.size) return false

  const plans = new Map<string, LinkClassPlan>()
  for (const target of targets) {
    const status = await checkLinkTarget(target)
    if (status.ready && status.postSlug) {
      plans.set(target, { kind: 'published', postSlug: status.postSlug })
    } else {
      plans.set(target, { kind: 'red' })
    }
  }

  const tr = buildLinkClassTransaction(editor, plans)
  return dispatchClassSyncTransaction(editor, tr)
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let boundEditor: Editor | null = null
let focusHandler: (() => void) | null = null
let visibilityHandler: (() => void) | null = null
let syncInProgress = false
let lastSyncAt = 0

async function syncWikiLinkClasses(editor: Editor, force = false) {
  if (syncInProgress || !editor.view) return
  const now = Date.now()
  if (!force && now - lastSyncAt < 3000) return

  syncInProgress = true
  lastSyncAt = now
  try {
    await reloadWikiIndex()
    await refreshWikiLinkClassesFromApi(editor)
  } finally {
    syncInProgress = false
  }
}

/** 编辑页打开 / 切回标签页 / 定时：API 双向同步 Wiki 内链红蓝样式（不监听 update，避免滚动回顶） */
export function initEditorWikiLinkClassSync(editor: Editor) {
  teardownEditorWikiLinkClassSync()
  boundEditor = editor

  void syncWikiLinkClasses(editor, true)

  focusHandler = () => {
    if (boundEditor) void syncWikiLinkClasses(boundEditor)
  }
  window.addEventListener('focus', focusHandler)

  visibilityHandler = () => {
    if (document.visibilityState === 'visible' && boundEditor) {
      void syncWikiLinkClasses(boundEditor)
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)

  pollTimer = window.setInterval(() => {
    if (boundEditor) void syncWikiLinkClasses(boundEditor)
  }, POLL_MS)

  for (const delay of [800, 2000]) {
    window.setTimeout(() => {
      if (boundEditor === editor) void syncWikiLinkClasses(editor, true)
    }, delay)
  }
}

export function teardownEditorWikiLinkClassSync() {
  if (focusHandler) {
    window.removeEventListener('focus', focusHandler)
    focusHandler = null
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  boundEditor = null
  syncInProgress = false
}

export function isWikiLinkClassSyncTransaction(tr: Transaction): boolean {
  return tr.getMeta(SYNC_META_KEY) === true
}

import type { Editor } from '@halo-dev/richtext-editor'
import { ExtensionLink } from '@halo-dev/richtext-editor'
import { refreshWikiLinkClasses } from '@/lib/wiki-link-commands'
import { checkLinkTarget } from '@/lib/wiki-redlink-open'
import { reloadWikiIndex } from '@/lib/wiki-index'
import { archivesHref, isWikiArchiveHref, normalizeTarget } from '@/lib/wiki-utils'

const REDLINK_TITLE = '尚未发布 · Ctrl+点击在新标签页打开并发布'
const POLL_MS = 30_000

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

function applyPublishedLinkMark(
  editor: Editor,
  linkTarget: string,
  postSlug: string
): boolean {
  const linkType = editor.schema.marks[ExtensionLink.name]
  if (!linkType) return false

  const want = normalizeTarget(linkTarget)
  if (!want) return false

  let tr = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type !== linkType) continue
      const href = String(mark.attrs.href || '')
      if (!href || !isWikiArchiveHref(href)) continue
      if (normalizeTarget(href) !== want) continue

      const hasRed = String(mark.attrs.class || '').includes('rs-wiki-redlink')
      const hrefOk = normalizeTarget(href) === normalizeTarget(postSlug)
      if (!hasRed && hrefOk) continue

      tr = tr.removeMark(pos, pos + node.nodeSize, linkType)
      tr = tr.addMark(
        pos,
        pos + node.nodeSize,
        linkType.create({
          ...mark.attrs,
          href: archivesHref(postSlug),
          class: null,
          title: null,
        })
      )
      changed = true
    }
  })

  if (changed) editor.view.dispatch(tr)
  return changed
}

function applyRedlinkMark(editor: Editor, linkTarget: string): boolean {
  const linkType = editor.schema.marks[ExtensionLink.name]
  if (!linkType) return false

  const want = normalizeTarget(linkTarget)
  if (!want) return false

  let tr = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type !== linkType) continue
      const href = String(mark.attrs.href || '')
      if (!href || !isWikiArchiveHref(href)) continue
      if (normalizeTarget(href) !== want) continue

      const hasRed = String(mark.attrs.class || '').includes('rs-wiki-redlink')
      if (hasRed) continue

      tr = tr.removeMark(pos, pos + node.nodeSize, linkType)
      tr = tr.addMark(
        pos,
        pos + node.nodeSize,
        linkType.create({
          ...mark.attrs,
          href: archivesHref(want),
          class: 'rs-wiki-redlink',
          target: '_self',
          title: REDLINK_TITLE,
        })
      )
      changed = true
    }
  })

  if (changed) editor.view.dispatch(tr)
  return changed
}

/** 与前台 rs-redlinks 一致：逐条 API 校验，已发布去红 / 已删除加红 */
export async function refreshWikiLinkClassesFromApi(editor: Editor): Promise<void> {
  const targets = collectWikiLinkTargets(editor)
  if (!targets.size) return

  for (const target of targets) {
    const status = await checkLinkTarget(target)
    if (status.ready && status.postSlug) {
      applyPublishedLinkMark(editor, target, status.postSlug)
    } else {
      applyRedlinkMark(editor, target)
    }
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let boundEditor: Editor | null = null
let updateHandler: (() => void) | null = null
let focusHandler: (() => void) | null = null
let visibilityHandler: (() => void) | null = null

async function syncWikiLinkClasses(editor: Editor) {
  await reloadWikiIndex()
  refreshWikiLinkClasses(editor)
  await refreshWikiLinkClassesFromApi(editor)
}

/** 编辑页打开 / 正文变更 / 切回标签页：双向同步 Wiki 内链红蓝样式 */
export function initEditorWikiLinkClassSync(editor: Editor) {
  teardownEditorWikiLinkClassSync()
  boundEditor = editor

  void syncWikiLinkClasses(editor)

  updateHandler = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (boundEditor) void syncWikiLinkClasses(boundEditor)
    }, 400)
  }
  editor.on('update', updateHandler)

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

  for (const delay of [800, 2000, 5000]) {
    window.setTimeout(() => {
      if (boundEditor === editor) void syncWikiLinkClasses(editor)
    }, delay)
  }
}

export function teardownEditorWikiLinkClassSync() {
  if (boundEditor && updateHandler) {
    boundEditor.off('update', updateHandler)
  }
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
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  boundEditor = null
  updateHandler = null
}

import type { Editor } from '@halo-dev/richtext-editor'
import { ExtensionLink } from '@halo-dev/richtext-editor'
import { refreshWikiLinkClasses } from '@/lib/wiki-link-commands'
import { checkLinkTarget } from '@/lib/wiki-redlink-open'
import { reloadWikiIndex } from '@/lib/wiki-index'
import { archivesHref, isWikiArchiveHref, normalizeTarget } from '@/lib/wiki-utils'

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

/** 与前台 rs-redlinks 一致：对仍带红链 class 的内链逐条 API 校验 */
export async function refreshWikiLinkClassesFromApi(editor: Editor): Promise<void> {
  const targets = new Set<string>()
  editor.state.doc.descendants((node) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type.name !== ExtensionLink.name) continue
      const href = String(mark.attrs.href || '')
      if (!isWikiArchiveHref(href)) continue
      const hasRed = String(mark.attrs.class || '').includes('rs-wiki-redlink')
      if (!hasRed) continue
      const target = normalizeTarget(href)
      if (target) targets.add(target)
    }
  })
  if (!targets.size) return

  for (const target of targets) {
    const status = await checkLinkTarget(target)
    if (!status.ready || !status.postSlug) continue
    applyPublishedLinkMark(editor, target, status.postSlug)
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let boundEditor: Editor | null = null
let updateHandler: (() => void) | null = null

async function syncWikiLinkClasses(editor: Editor) {
  await reloadWikiIndex()
  refreshWikiLinkClasses(editor)
  await refreshWikiLinkClassesFromApi(editor)
}

/** 编辑页打开 / 正文变更后：按索引 + API 去掉已发布红链的 rs-wiki-redlink class */
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

  // Halo 异步注入正文：再补几次同步
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
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  boundEditor = null
  updateHandler = null
}

import { ExtensionLink, type Editor } from '@halo-dev/richtext-editor'
import {
  archivesHref,
  defaultLabel,
  findPageByQuery,
  isExternalUrl,
  normalizeExternalUrl,
  normalizeTarget,
} from '@/lib/wiki-utils'
import { getWikiIndexState } from '@/lib/wiki-index'

export type ActiveWikiLinkInfo = {
  href: string
  target: string
  label: string
  isRed: boolean
  postSlug: string | null
}

export function getSelectedText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection
  if (empty) return ''
  return editor.state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim()
}

function readActiveLinkLabel(editor: Editor): string {
  const savedFrom = editor.state.selection.from
  const savedTo = editor.state.selection.to
  editor.commands.extendMarkRange(ExtensionLink.name)
  const label = editor.state.doc
    .textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  editor.commands.setTextSelection({ from: savedFrom, to: savedTo })
  return label
}

/** 从 ProseMirror 选区读取 link href（不依赖 editor.isActive / 焦点） */
export function hrefAtEditorSelection(editor: Editor): string {
  const { from, to } = editor.state.selection
  const $from = editor.state.doc.resolve(from)
  const $to = editor.state.doc.resolve(to)

  for (const mark of $from.marks()) {
    if (mark.type.name === ExtensionLink.name && mark.attrs.href) {
      return String(mark.attrs.href).trim()
    }
  }
  if (to > from) {
    let found = ''
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (found || !node.isText) return
      const mark = node.marks.find((m) => m.type.name === ExtensionLink.name)
      if (mark?.attrs?.href) found = String(mark.attrs.href).trim()
    })
    if (found) return found
  }
  const before = $from.nodeBefore
  if (before?.isText) {
    const mark = before.marks.find((m) => m.type.name === ExtensionLink.name)
    if (mark?.attrs?.href) return String(mark.attrs.href).trim()
  }
  const after = $to.nodeAfter
  if (after?.isText) {
    const mark = after.marks.find((m) => m.type.name === ExtensionLink.name)
    if (mark?.attrs?.href) return String(mark.attrs.href).trim()
  }
  return ''
}

export type LinkInfoAtPos = {
  href: string
  label: string
  isRed: boolean
}

/** 点击位置处的 link mark（只读，不 mutate 选区） */
export function linkInfoAtPos(editor: Editor, pos: number): LinkInfoAtPos | null {
  const $pos = editor.state.doc.resolve(pos)
  const pick = (mark: { type: { name: string }; attrs: Record<string, unknown> } | undefined) => {
    if (!mark || mark.type.name !== ExtensionLink.name || !mark.attrs.href) return null
    const href = String(mark.attrs.href).trim()
    if (!href || isExternalUrl(href)) return null
    const linkClass = String(mark.attrs.class || '')
    const target = normalizeTarget(href)
    const { pageIndex, publishedSlugs } = getWikiIndexState()
    const hit = findPageByQuery(target, pageIndex, publishedSlugs)
    const published = !!(hit?.published || publishedSlugs[target])
    const isRed = linkClass.includes('rs-wiki-redlink') || !published
    let label = ''
    const before = $pos.nodeBefore
    if (before?.isText) label = (before.text || '').trim()
    if (!label) {
      label = $pos.parent.textBetween(Math.max(0, $pos.parentOffset - 48), $pos.parentOffset, ' ').trim()
    }
    if (!label) label = target
    return { href, label, isRed }
  }

  for (const mark of $pos.marks()) {
    const hit = pick(mark)
    if (hit) return hit
  }
  const before = $pos.nodeBefore
  if (before?.isText) {
    for (const mark of before.marks) {
      const hit = pick(mark)
      if (hit) return hit
    }
  }
  return null
}

export function labelAtEditorSelection(editor: Editor, fallback = ''): string {
  if (editor.isActive(ExtensionLink.name)) {
    return readActiveLinkLabel(editor) || fallback
  }
  const { from, to } = editor.state.selection
  if (to > from) {
    return editor.state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim() || fallback
  }
  return fallback
}

export function getWikiLinkInfoFromHref(
  editor: Editor,
  href: string,
  labelOverride?: string
): ActiveWikiLinkInfo {
  const target = normalizeTarget(href)
  const { pageIndex, publishedSlugs } = getWikiIndexState()
  const hit = findPageByQuery(target, pageIndex, publishedSlugs)
  const published = !!(hit?.published || publishedSlugs[target])
  const label =
    labelOverride ||
    (published ? hit?.title : undefined) ||
    defaultLabel(target)
  return {
    href,
    target,
    label,
    isRed: !published,
    postSlug: hit?.published ? hit.slug : null,
  }
}

/** 文档内匹配 href 的 link 位置；nearPos 用于同 href 多实例时取最近 */
export function findLinkPosByHref(
  editor: Editor,
  href: string,
  nearPos?: number
): number | null {
  const want = normalizeTarget(href)
  if (!want) return null
  const candidates: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const mark = node.marks.find((m) => m.type.name === ExtensionLink.name)
    if (!mark?.attrs?.href) return
    if (normalizeTarget(String(mark.attrs.href)) === want) candidates.push(pos)
  })
  if (!candidates.length) return null
  if (nearPos == null) return candidates[0]!
  return candidates.reduce((best, p) =>
    Math.abs(p - nearPos) < Math.abs(best - nearPos) ? p : best
  )
}

export function focusWikiLinkAt(
  editor: Editor,
  anchor?: { pos?: number; href?: string }
): boolean {
  let pos = anchor?.pos
  if (pos == null && anchor?.href) {
    pos = findLinkPosByHref(editor, anchor.href) ?? undefined
  }
  if (pos == null) return editor.commands.extendMarkRange(ExtensionLink.name)
  return editor.chain().focus().setTextSelection(pos).extendMarkRange(ExtensionLink.name).run()
}

/** 索引刷新后，双向同步 Wiki 内链样式（已发布去红 / 未发布加红） */
export function refreshWikiLinkClasses(editor: Editor): void {
  const { pageIndex, publishedSlugs } = getWikiIndexState()
  const linkType = editor.schema.marks[ExtensionLink.name]
  if (!linkType) return

  type MarkUpdate = { from: number; to: number; attrs: Record<string, unknown> }
  const updates: MarkUpdate[] = []

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type !== linkType) continue
      const href = String(mark.attrs.href || '')
      if (!href || isExternalUrl(href)) continue
      const path = href.replace(/^https?:\/\/[^/]+/i, '')
      if (!path.startsWith('/archives/') && !path.includes('/archives/')) continue

      const target = normalizeTarget(href)
      const hit = findPageByQuery(target, pageIndex, {})
      // 仅用 UC/文章 API 索引，不用 git slug 缓存（删文后仍可能残留）
      const published = hit?.published === true
      const hasRed = String(mark.attrs.class || '').includes('rs-wiki-redlink')

      if (published && hasRed) {
        const resolved = hit?.slug || target
        updates.push({
          from: pos,
          to: pos + node.nodeSize,
          attrs: {
            ...mark.attrs,
            href: archivesHref(resolved),
            class: null,
            title: null,
          },
        })
      } else if (!published && !hasRed) {
        updates.push({
          from: pos,
          to: pos + node.nodeSize,
          attrs: {
            ...mark.attrs,
            href: archivesHref(target),
            class: 'rs-wiki-redlink',
            target: '_self',
            title: '尚未发布 · Ctrl+点击在新标签页打开并发布',
          },
        })
      }
    }
  })

  if (!updates.length) return
  let tr = editor.state.tr
  for (const u of updates) {
    tr = tr.removeMark(u.from, u.to, linkType)
    tr = tr.addMark(u.from, u.to, linkType.create(u.attrs))
  }
  tr = tr.setMeta('addToHistory', false).setMeta('rsWikiLinkClassSync', true)
  const scrollEl = editor.view.dom.parentElement ?? editor.view.dom
  const scrollTop = scrollEl.scrollTop
  const scrollLeft = scrollEl.scrollLeft
  editor.view.dispatch(tr)
  requestAnimationFrame(() => {
    scrollEl.scrollTop = scrollTop
    scrollEl.scrollLeft = scrollLeft
  })
}

/** 选区是否在 Wiki 内链（/archives/…）上；普通文本或外部链接返回 false */
export function isSelectionOnWikiArchiveLink(editor: Editor): boolean {
  if (!editor.isActive(ExtensionLink.name)) return false
  const href = String(editor.getAttributes(ExtensionLink.name).href || '').trim()
  if (!href || isExternalUrl(href)) return false
  const path = href.replace(/^https?:\/\/[^/]+/i, '')
  return path.startsWith('/archives/') || path.includes('/archives/')
}

export function getActiveWikiLinkInfo(editor: Editor): ActiveWikiLinkInfo | null {
  if (!isSelectionOnWikiArchiveLink(editor)) return null
  const attrs = editor.getAttributes(ExtensionLink.name)
  const href = String(attrs.href || '').trim()
  const target = normalizeTarget(href)
  const { pageIndex, publishedSlugs } = getWikiIndexState()
  const hit = findPageByQuery(target, pageIndex, publishedSlugs)
  const published = !!(hit?.published || publishedSlugs[target])
  const linkClass = String(attrs.class || '')
  const isRed = linkClass.includes('rs-wiki-redlink') || !published
  const label = readActiveLinkLabel(editor) || hit?.title || target
  return {
    href,
    target,
    label,
    isRed,
    postSlug: hit?.published ? hit.slug : null,
  }
}

export function applyWikiLink(
  editor: Editor,
  rawTarget: string,
  label?: string,
  anchor?: { pos?: number; href?: string }
): boolean {
  const text = getSelectedText(editor)
  label = (label || text || '').trim()

  if (isExternalUrl(rawTarget)) {
    const href = normalizeExternalUrl(rawTarget)
    if (!label) label = href
    const chain = editor.chain().focus()
    if (anchor?.pos != null) chain.setTextSelection(anchor.pos)
    else if (anchor?.href) {
      const p = findLinkPosByHref(editor, anchor.href, anchor.pos)
      if (p != null) chain.setTextSelection(p)
    }
    return chain.extendMarkRange(ExtensionLink.name).setLink({ href }).run()
  }

  const target = normalizeTarget(rawTarget)
  if (!target) return false
  const { pageIndex, publishedSlugs } = getWikiIndexState()
  const hit = findPageByQuery(target, pageIndex, publishedSlugs)
  const resolved = hit?.slug || target
  const published = hit ? hit.published : !!(publishedSlugs[target] || publishedSlugs[resolved])
  const href = archivesHref(resolved)

  const chain = editor.chain().focus()
  if (anchor?.pos != null) {
    chain.setTextSelection(anchor.pos)
  } else if (anchor?.href) {
    const p = findLinkPosByHref(editor, anchor.href, anchor.pos)
    if (p != null) chain.setTextSelection(p)
  }

  return chain
    .extendMarkRange(ExtensionLink.name)
    .setLink({
      href,
      class: published ? null : 'rs-wiki-redlink',
      target: '_self',
      title: published ? null : '尚未发布 · Ctrl+点击在新标签页打开并发布',
    })
    .run()
}

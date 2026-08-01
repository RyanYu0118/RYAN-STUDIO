import {
  ExtensionLink,
  type Editor,
} from '@halo-dev/richtext-editor'
import {
  archivesHref,
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

export function applyWikiLink(editor: Editor, rawTarget: string, label?: string): boolean {
  const text = getSelectedText(editor)
  label = (label || text || '').trim()

  if (isExternalUrl(rawTarget)) {
    const href = normalizeExternalUrl(rawTarget)
    if (!label) label = href
    return editor.chain().focus().extendMarkRange(ExtensionLink.name).setLink({ href }).run()
  }

  const target = normalizeTarget(rawTarget)
  if (!target) return false
  const { pageIndex, publishedSlugs } = getWikiIndexState()
  const hit = findPageByQuery(target, pageIndex, publishedSlugs)
  const resolved = hit?.slug || target
  const published = hit ? hit.published : !!(publishedSlugs[target] || publishedSlugs[resolved])
  const href = archivesHref(resolved)

  return editor
    .chain()
    .focus()
    .extendMarkRange(ExtensionLink.name)
    .setLink({
      href,
      class: published ? null : 'rs-wiki-redlink',
      target: '_self',
      title: published ? null : '尚未发布 · 前台将显示为红链',
    })
    .run()
}

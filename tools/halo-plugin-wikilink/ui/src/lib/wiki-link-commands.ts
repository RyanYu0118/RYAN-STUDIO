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

export function getSelectedText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection
  if (empty) return ''
  return editor.state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim()
}

/** 选区是否在 Wiki 内链（/archives/…）上；普通文本或外部链接返回 false */
export function isSelectionOnWikiArchiveLink(editor: Editor): boolean {
  if (!editor.isActive(ExtensionLink.name)) return false
  const href = String(editor.getAttributes(ExtensionLink.name).href || '').trim()
  if (!href || isExternalUrl(href)) return false
  const path = href.replace(/^https?:\/\/[^/]+/i, '')
  return path.startsWith('/archives/') || path.includes('/archives/')
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

import {
  ExtensionLink,
  type Editor,
} from '@halo-dev/richtext-editor'
import {
  archivesHref,
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
  const href = archivesHref(target)
  const { publishedSlugs } = getWikiIndexState()
  const published = !!publishedSlugs[target]
  const slug = target

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

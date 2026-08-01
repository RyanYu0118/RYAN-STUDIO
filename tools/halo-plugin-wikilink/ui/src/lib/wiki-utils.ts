import { WIKI_PATH_PREFIX } from './wiki-config'

export type WikiPage = {
  slug: string
  title: string
  published: boolean
  label?: string
  external?: boolean
  red?: boolean
  meta?: string
}

export function normalizeTarget(raw: string): string {
  let path = String(raw || '')
    .trim()
    .replace(/\\/g, '/')
  if (path.startsWith(WIKI_PATH_PREFIX)) path = path.slice(WIKI_PATH_PREFIX.length)
  if (path.startsWith('/archives/')) path = path.slice('/archives/'.length)
  while (path.startsWith('../') || path.startsWith('./')) {
    path = path.replace(/^\.\.?\//, '')
  }
  if (path.endsWith('.md')) path = path.slice(0, -3)
  if (path.endsWith('/index')) path = path.slice(0, -'/index'.length)
  return path.replace(/^\/+|\/+$/g, '')
}

const REDLINK_SLUG_PREFIXES = ['rs_', 'mcwws_'] as const

/** 红链注解目标与 spec.slug 是否同一篇文章（仅用于搜索列表去重） */
export function isRedlinkSlugAlias(postSlug: string, linkTarget: string): boolean {
  const slug = normalizeTarget(postSlug)
  const target = normalizeTarget(linkTarget)
  if (!target || target === slug) return true
  for (const prefix of REDLINK_SLUG_PREFIXES) {
    if (slug === prefix + target) return true
    const underscored = target.replace(/\//g, '_').toLowerCase()
    if (slug === prefix + underscored) return true
  }
  return false
}

export function defaultLabel(target: string): string {
  const parts = normalizeTarget(target).split('/')
  const last = parts[parts.length - 1] || target
  return last.replace(/[-_]+/g, ' ')
}

export function archivesHref(target: string): string {
  const slug = normalizeTarget(target)
  if (!slug) return WIKI_PATH_PREFIX
  return WIKI_PATH_PREFIX + encodeURIComponent(slug).replace(/%2F/g, '/')
}

export function isExternalUrl(raw: string): boolean {
  const s = String(raw || '').trim()
  return /^(https?:\/\/|mailto:|tel:|\/\/)/i.test(s) || /^www\./i.test(s)
}

export function normalizeExternalUrl(raw: string): string {
  const s = String(raw || '').trim()
  if (/^www\./i.test(s)) return `https://${s}`
  return s
}

export function searchPages(
  query: string,
  pageIndex: WikiPage[],
  suggestPaths: string[],
  publishedSlugs: Record<string, boolean>
): WikiPage[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return pageIndex.slice(0, 10)
  const out: WikiPage[] = []
  pageIndex.forEach((p) => {
    const hay = `${p.title} ${p.slug} ${p.label || ''}`.toLowerCase()
    if (hay.includes(q)) out.push(p)
  })
  suggestPaths.forEach((path) => {
    if (!path.toLowerCase().includes(q)) return
    if (out.some((x) => x.slug === path)) return
    out.push({
      slug: path,
      title: defaultLabel(path),
      published: !!publishedSlugs[path],
    })
  })
  return out.slice(0, 12)
}

export function exactPage(
  query: string,
  pageIndex: WikiPage[],
  publishedSlugs: Record<string, boolean>
): WikiPage | null {
  const q = normalizeTarget(query)
  if (!q) return null
  for (const p of pageIndex) {
    if (p.slug === q || p.title === q) return p
  }
  if (publishedSlugs[q]) {
    return { slug: q, title: defaultLabel(q), published: true }
  }
  return null
}

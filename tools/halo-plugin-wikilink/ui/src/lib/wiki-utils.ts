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

export function isPostPublished(post: {
  spec?: { deleted?: boolean; publish?: boolean }
  metadata?: { labels?: Record<string, string> }
  status?: { phase?: string }
}): boolean {
  const labels = post.metadata?.labels || {}
  if (labels['content.halo.run/deleted'] === 'true') return false
  if (labels['content.halo.run/published'] === 'true') return true
  const spec = post.spec || {}
  if (spec.deleted === true) return false
  const status = post.status || {}
  return spec.publish === true && status.phase === 'PUBLISHED'
}

/** 按 slug / 标题 / 红链别名解析已有页面（含草稿） */
export function findPageByQuery(
  query: string,
  pageIndex: WikiPage[],
  publishedSlugs: Record<string, boolean>
): WikiPage | null {
  const q = normalizeTarget(query)
  if (!q) return null
  for (const p of pageIndex) {
    if (p.slug === q || p.title === q) return p
    const label = p.label ? normalizeTarget(p.label) : ''
    if (label === q) return p
    if (isRedlinkSlugAlias(p.slug, q)) return p
  }
  if (publishedSlugs[q]) {
    return { slug: q, title: defaultLabel(q), published: true }
  }
  for (const prefix of REDLINK_SLUG_PREFIXES) {
    const underscored = q.replace(/\//g, '_').toLowerCase()
    for (const p of pageIndex) {
      if (p.slug === prefix + q || p.slug === prefix + underscored) return p
    }
  }
  return null
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
    if (out.some((x) => isRedlinkSlugAlias(x.slug, path))) return
    if (findPageByQuery(path, pageIndex, publishedSlugs)?.published) return
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
  return findPageByQuery(query, pageIndex, publishedSlugs)
}

import { WIKI_SLUG_INDEX } from './wiki-config'
import {
  defaultLabel,
  isPostPublished,
  isRedlinkSlugAlias,
  normalizeTarget,
  type WikiPage,
} from './wiki-utils'

let pageIndex: WikiPage[] = []
let suggestPaths: string[] = []
let publishedSlugs: Record<string, boolean> = {}
let loadPromise: Promise<void> | null = null

export function getWikiIndexState() {
  return { pageIndex, suggestPaths, publishedSlugs }
}

/** 每次打开 Wiki 链接面板时刷新，避免新建文章后仍用旧索引 */
export function reloadWikiIndex(): Promise<void> {
  loadPromise = null
  return loadWikiIndex()
}

function resetIndexCollections() {
  pageIndex.length = 0
  suggestPaths.length = 0
  for (const key of Object.keys(publishedSlugs)) delete publishedSlugs[key]
}

function ingestPost(post: {
  spec?: { slug?: string; title?: string; deleted?: boolean; publish?: boolean }
  metadata?: { labels?: Record<string, string>; annotations?: Record<string, string> }
  status?: { phase?: string }
}) {
  const slug = post.spec?.slug
  const title = post.spec?.title || slug || ''
  if (!slug) return
  const pub = isPostPublished(post)
  pageIndex.push({ slug, title, published: pub })
  if (pub) {
    publishedSlugs[slug] = true
    const titleKey = normalizeTarget(title)
    if (titleKey) publishedSlugs[titleKey] = true
  }
  const lt = post.metadata?.annotations?.['rs.wiki/redlink-target-slug']
  if (lt) {
    const n = normalizeTarget(lt)
    publishedSlugs[n] = pub
    if (!isRedlinkSlugAlias(slug, lt)) {
      pageIndex.push({ slug: n, title, published: pub, label: lt })
    }
  }
}

async function loadPosts(page = 1, api: 'uc' | 'public' = 'uc'): Promise<void> {
  const base =
    api === 'uc'
      ? '/apis/uc.api.content.halo.run/v1alpha1/posts'
      : '/apis/api.content.halo.run/v1alpha1/posts'
  const res = await fetch(`${base}?page=${page}&size=100`, { credentials: 'same-origin' })
  if (!res.ok) {
    if (api === 'uc') return loadPosts(1, 'public')
    return
  }
  const data = await res.json()
  ;(data.items || []).forEach(ingestPost)
  if (data.hasNext && page < 10) await loadPosts(page + 1, api)
}

export async function loadWikiIndex(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    resetIndexCollections()

    try {
      const res = await fetch(WIKI_SLUG_INDEX, { credentials: 'same-origin', cache: 'no-cache' })
      const data = await res.json()
      const seen: Record<string, boolean> = {}
      ;['gitSlugs', 'slugs', 'redlinkTargets'].forEach((key) => {
        ;(data[key] || []).forEach((p: string) => {
          const n = normalizeTarget(p)
          if (!n || seen[n]) return
          if (key === 'redlinkTargets') {
            if (publishedSlugs[n] || publishedSlugs[`rs_${n}`]) return
            const u = n.replace(/\//g, '_').toLowerCase()
            if (publishedSlugs[u] || publishedSlugs[`rs_${u}`]) return
          }
          seen[n] = true
          suggestPaths.push(n)
          if (key === 'slugs') publishedSlugs[n] = true
        })
      })
      suggestPaths.sort()
    } catch {
      suggestPaths = []
    }

    try {
      await loadPosts(1, 'uc')
    } catch {
      /* 无文章 API 权限时仍可用 slug 索引 */
    }
  })()
  return loadPromise
}

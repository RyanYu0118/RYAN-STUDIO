import { WIKI_SLUG_INDEX } from './wiki-config'
import { defaultLabel, normalizeTarget, type WikiPage } from './wiki-utils'

let pageIndex: WikiPage[] = []
let suggestPaths: string[] = []
let publishedSlugs: Record<string, boolean> = {}
let loadPromise: Promise<void> | null = null

export function getWikiIndexState() {
  return { pageIndex, suggestPaths, publishedSlugs }
}

async function loadPosts(page = 1): Promise<void> {
  const res = await fetch(
    `/apis/api.content.halo.run/v1alpha1/posts?page=${page}&size=100`,
    { credentials: 'same-origin' }
  )
  if (!res.ok) return
  const data = await res.json()
  ;(data.items || []).forEach((post: {
    spec?: { slug?: string; title?: string }
    metadata?: { labels?: Record<string, string>; annotations?: Record<string, string> }
  }) => {
    const slug = post.spec?.slug
    const title = post.spec?.title || slug || ''
    if (!slug) return
    const labels = post.metadata?.labels || {}
    const pub = labels['content.halo.run/published'] === 'true'
    pageIndex.push({ slug, title, published: pub })
    if (pub) publishedSlugs[slug] = true
    const lt = post.metadata?.annotations?.['rs.wiki/redlink-target-slug']
    if (lt) {
      const n = normalizeTarget(lt)
      publishedSlugs[n] = pub
      pageIndex.push({ slug: n, title, published: pub, label: lt })
    }
  })
  if (data.hasNext && page < 10) await loadPosts(page + 1)
}

export async function loadWikiIndex(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    pageIndex = []
    suggestPaths = []
    publishedSlugs = {}

    try {
      const res = await fetch(WIKI_SLUG_INDEX, { credentials: 'same-origin', cache: 'no-cache' })
      const data = await res.json()
      const seen: Record<string, boolean> = {}
      ;['gitSlugs', 'slugs', 'redlinkTargets'].forEach((key) => {
        ;(data[key] || []).forEach((p: string) => {
          const n = normalizeTarget(p)
          if (!n || seen[n]) return
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
      await loadPosts(1)
    } catch {
      /* 无文章 API 权限时仍可用 slug 索引 */
    }
  })()
  return loadPromise
}

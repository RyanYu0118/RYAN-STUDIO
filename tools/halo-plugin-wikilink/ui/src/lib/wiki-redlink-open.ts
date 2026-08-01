import type { Editor } from '@halo-dev/richtext-editor'
import { ExtensionLink } from '@halo-dev/richtext-editor'
import { reloadWikiIndex } from '@/lib/wiki-index'
import { getRedlinkConfig } from '@/lib/wiki-redlink-config'
import { isExternalUrl, isPostPublished, isWikiArchiveHref, normalizeTarget } from '@/lib/wiki-utils'
import { WIKI_PATH_PREFIX } from '@/lib/wiki-config'
import {
  applyWikiLink,
  getActiveWikiLinkInfo,
  getWikiLinkInfoFromHref,
  hrefAtEditorSelection,
} from '@/lib/wiki-link-commands'

const REDLINK_TARGET_ANN = 'rs.wiki/redlink-target-slug'

export type LinkTargetStatus = {
  linkTarget: string
  ready: boolean
  postSlug: string | null
}

function getCookie(name: string): string {
  const m = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
  )
  return m ? decodeURIComponent(m[1]) : ''
}

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const xsrf = getCookie('XSRF-TOKEN')
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf
  return headers
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function slugFromTitleExact(title: string, prefix: string): string {
  let s = (title || '').trim()
  if (!s || s.toLowerCase() === 'index') return prefix + 'untitled'
  s = s.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\//g, '_')
  if (s.length > 180) s = s.slice(0, 180)
  return prefix + s
}

async function fetchPostBySlug(slug: string) {
  const q =
    '/apis/api.content.halo.run/v1alpha1/posts?fieldSelector=' +
    encodeURIComponent('spec.slug=' + slug) +
    '&size=1'
  const res = await fetch(q, { credentials: 'same-origin' })
  if (!res.ok) return null
  const data = await res.json()
  return (data.items && data.items[0]) || null
}

async function slugPublishedViaApi(slug: string): Promise<boolean> {
  const post = await fetchPostBySlug(slug)
  return isPostPublished(post || {})
}

async function fetchAllPublishedRedlinkTargets(): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  let page = 1
  while (page <= 20) {
    const res = await fetch(
      `/apis/api.content.halo.run/v1alpha1/posts?page=${page}&size=100`,
      { credentials: 'same-origin' }
    )
    if (!res.ok) break
    const data = await res.json()
    for (const post of data.items || []) {
      if (!isPostPublished(post)) continue
      const ann = post.metadata?.annotations
      const target = ann?.[REDLINK_TARGET_ANN]
      const ps = post.spec?.slug
      if (target && ps) map[target] = ps
    }
    if (!data.hasNext) break
    page += 1
  }
  return map
}

export async function checkLinkTarget(linkTarget: string): Promise<LinkTargetStatus> {
  const target = normalizeTarget(linkTarget)
  if (!target) return { linkTarget: linkTarget, ready: false, postSlug: null }

  if (await slugPublishedViaApi(target)) {
    return { linkTarget: target, ready: true, postSlug: target }
  }

  const map = await fetchAllPublishedRedlinkTargets()
  const postSlug = map[target]
  if (!postSlug) {
    return { linkTarget: target, ready: false, postSlug: null }
  }
  if (!(await slugPublishedViaApi(postSlug))) {
    return { linkTarget: target, ready: false, postSlug: null }
  }
  return { linkTarget: target, ready: true, postSlug }
}

async function ensureUniquePublishSlug(candidate: string, postName: string, attempt = 0): Promise<string> {
  const existing = await fetchPostBySlug(candidate)
  if (!existing) return candidate
  if (attempt >= 8) {
    return candidate + '_' + postName.replace(/-/g, '').slice(0, 8)
  }
  const suffix = attempt === 0 ? postName.replace(/-/g, '').slice(0, 6) : String(attempt + 2)
  return ensureUniquePublishSlug(candidate + '_' + suffix, postName, attempt + 1)
}

function resolvePublishSlug(linkSlug: string, postName: string, title: string) {
  const cfg = getRedlinkConfig()
  const publishSlug = slugFromTitleExact(title || linkSlug, cfg.slugPrefix)
  return {
    publishSlug,
    linkTarget: linkSlug || '',
  }
}

function getCurrentEditorPostName(): string | null {
  if (location.pathname.indexOf('/console/posts/editor') < 0) return null
  return new URLSearchParams(location.search).get('name')
}

async function fetchCurrentEditorPost() {
  const name = getCurrentEditorPostName()
  if (!name) return null
  const res = await fetch(
    `/apis/uc.api.content.halo.run/v1alpha1/posts/${encodeURIComponent(name)}`,
    { credentials: 'include', headers: apiHeaders() }
  )
  if (!res.ok) return null
  return res.json()
}

function inheritMetaFromSource(sourcePost: {
  spec?: { categories?: string[]; tags?: string[]; cover?: string }
} | null) {
  const cfg = getRedlinkConfig()
  let categories = [cfg.defaultCategory]
  let tags: string[] = []
  let cover = ''
  if (sourcePost?.spec) {
    if (sourcePost.spec.categories?.length) categories = sourcePost.spec.categories.slice()
    if (sourcePost.spec.tags?.length) tags = sourcePost.spec.tags.slice()
    if (sourcePost.spec.cover) cover = sourcePost.spec.cover
  } else {
    tags = cfg.defaultTags.slice()
  }
  return { categories, tags, cover }
}

function buildRedlinkDraftContent(postName: string) {
  const html =
    `<div class="html-edited"><div id="halo-manual-id" style="display:none;">${postName}</div></div><p>待完善。</p>`
  return { raw: html, content: html, rawType: 'html' as const }
}

async function publishPostAndWait(name: string, headers: Record<string, string>) {
  const res = await fetch(
    `/apis/uc.api.content.halo.run/v1alpha1/posts/${encodeURIComponent(name)}/publish`,
    { method: 'PUT', credentials: 'include', headers, body: '{}' }
  )
  if (!res.ok) {
    const t = await res.text()
    throw new Error('发布失败 HTTP ' + res.status + (t ? ': ' + t.slice(0, 200) : ''))
  }
}

async function repairPostOnce(name: string, headers: Record<string, string>) {
  const res = await fetch(
    `/apis/uc.api.content.halo.run/v1alpha1/posts/${encodeURIComponent(name)}`,
    { credentials: 'include', headers }
  )
  if (!res.ok) return
  const post = await res.json()
  const spec = post.spec || {}
  const status = post.status || {}
  const head = spec.headSnapshot || spec.baseSnapshot
  if (!head) return
  if (status.inProgress !== true && spec.releaseSnapshot) return
  spec.releaseSnapshot = head
  status.inProgress = false
  post.spec = spec
  post.status = status
  await fetch(`/apis/uc.api.content.halo.run/v1alpha1/posts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    credentials: 'include',
    headers,
    body: JSON.stringify(post),
  })
}

async function waitUntilPublished(slug: string, attempt = 0): Promise<boolean> {
  if (attempt > 20) return false
  if (await slugPublishedViaApi(slug)) return true
  await wait(250)
  return waitUntilPublished(slug, attempt + 1)
}

async function createAndPublishRedlink(
  linkSlug: string,
  title: string,
  sourcePost: unknown
): Promise<{ ok: boolean; slug?: string; linkTarget?: string; error?: string }> {
  const cfg = getRedlinkConfig()
  const postName = crypto.randomUUID()
  let resolved = resolvePublishSlug(linkSlug, postName, title)
  resolved = {
    ...resolved,
    publishSlug: await ensureUniquePublishSlug(resolved.publishSlug, postName),
  }

  const draftContent = buildRedlinkDraftContent(postName)
  const contentJson = JSON.stringify({
    raw: draftContent.raw,
    content: draftContent.content,
    rawType: draftContent.rawType,
  })
  const inherited = inheritMetaFromSource(sourcePost as { spec?: { categories?: string[]; tags?: string[]; cover?: string } })
  const headers = apiHeaders()

  const annotations: Record<string, string> = {
    'content.halo.run/preferred-editor': 'default',
    'content.halo.run/permalink-pattern': '/archives/{slug}',
    'content.halo.run/content-json': contentJson,
  }
  if (resolved.linkTarget && resolved.linkTarget !== resolved.publishSlug) {
    annotations[REDLINK_TARGET_ANN] = resolved.linkTarget
  }

  const body = {
    apiVersion: 'content.halo.run/v1alpha1',
    kind: 'Post',
    metadata: {
      name: postName,
      annotations,
      labels: {
        'content.halo.run/published': 'false',
        'content.halo.run/deleted': 'false',
        'content.halo.run/visible': 'PUBLIC',
      },
    },
    spec: {
      allowComment: true,
      categories: inherited.categories,
      cover: inherited.cover,
      deleted: false,
      excerpt: { autoGenerate: true, raw: '' },
      htmlMetas: [],
      owner: cfg.postOwner,
      pinned: false,
      priority: 0,
      publish: false,
      publishTime: '',
      slug: resolved.publishSlug,
      tags: inherited.tags,
      template: '',
      title,
      visible: 'PUBLIC',
    },
  }

  const createRes = await fetch('/apis/uc.api.content.halo.run/v1alpha1/posts', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  })

  if (createRes.status === 401 || createRes.status === 403) {
    return { ok: false, error: '需要登录' }
  }

  if (!createRes.ok) {
    const existing = await fetchPostBySlug(resolved.publishSlug)
    if (existing?.metadata?.name) {
      const en = existing.metadata.name as string
      if (isPostPublished(existing)) {
        return { ok: true, slug: resolved.publishSlug, linkTarget: resolved.linkTarget }
      }
      await publishPostAndWait(en, headers)
      await repairPostOnce(en, headers)
      await waitUntilPublished(resolved.publishSlug)
      return { ok: true, slug: resolved.publishSlug, linkTarget: resolved.linkTarget }
    }
    const t = await createRes.text()
    return { ok: false, error: t || String(createRes.status) }
  }

  const created = await createRes.json()
  const name = created.metadata?.name || postName
  await publishPostAndWait(name, headers)
  await repairPostOnce(name, headers)
  const pubOk = await waitUntilPublished(resolved.publishSlug)
  if (!pubOk && !(await slugPublishedViaApi(resolved.publishSlug))) {
    return { ok: false, error: '发布未完成，请稍后在控制台检查 slug: ' + resolved.publishSlug }
  }
  return { ok: true, slug: resolved.publishSlug, linkTarget: resolved.linkTarget }
}

function openArchive(slug: string, newTab: boolean) {
  const url = WIKI_PATH_PREFIX + encodeURIComponent(slug).replace(/%2F/g, '/')
  if (newTab) window.open(url, '_blank')
  else window.location.href = url
}

/** 编辑器/后台：已发布或红链均直接创建发布；默认新标签打开（Ctrl+点击同） */
export async function openWikiArchiveLinkFromEditor(
  editor: Editor,
  options?: { href?: string; label?: string; newTab?: boolean }
): Promise<boolean> {
  let href = (options?.href || '').trim()
  if (!href) href = hrefAtEditorSelection(editor)
  if (!href) href = String(editor.getAttributes(ExtensionLink.name).href || '').trim()
  if (!href || !isWikiArchiveHref(href)) return false

  editor.commands.extendMarkRange(ExtensionLink.name)

  await reloadWikiIndex()

  const info =
    getActiveWikiLinkInfo(editor) ||
    getWikiLinkInfoFromHref(editor, href)
  if (options?.label) info.label = options.label

  const newTab = options?.newTab !== false

  const status = await checkLinkTarget(info.target)
  if (status.ready && status.postSlug) {
    openArchive(status.postSlug, newTab)
    if (info.isRed) {
      applyWikiLink(editor, status.postSlug, info.label)
    }
    return true
  }

  const sourcePost = await fetchCurrentEditorPost()
  const result = await createAndPublishRedlink(
    info.target,
    info.label || info.target,
    sourcePost
  )

  if (!result.ok) {
    alert('发布失败：' + (result.error || '未知错误'))
    return true
  }

  await reloadWikiIndex()
  const finalSlug = result.slug || info.target
  applyWikiLink(editor, finalSlug, info.label)
  openArchive(finalSlug, newTab)
  return true
}

/**
 * 编辑页 Wiki 内链导航策略：
 * - 蓝链（已发布）：允许 Ctrl+点击 / 「打开链接」新标签打开
 * - 红链（未发布）：暂禁创建与跳转，请在前台文章页点击
 */
export const EDITOR_REDLINK_NAV_ENABLED = false
export const EDITOR_PUBLISHED_LINK_NAV_ENABLED = true

export function isEditorRedlinkNavEnabled(): boolean {
  return EDITOR_REDLINK_NAV_ENABLED
}

export function isEditorPublishedLinkNavEnabled(): boolean {
  return EDITOR_PUBLISHED_LINK_NAV_ENABLED
}

/** @deprecated 仅当红链与蓝链均允许时为 true */
export function isEditorWikiLinkNavEnabled(): boolean {
  return EDITOR_REDLINK_NAV_ENABLED && EDITOR_PUBLISHED_LINK_NAV_ENABLED
}

export function isEditorConsolePage(): boolean {
  return location.pathname.indexOf('/console/posts/editor') >= 0
}

export const EDITOR_WIKI_REDLINK_TITLE =
  '尚未发布 · 请在前台文章页点击红链创建'

export function isDomRedlinkAnchor(anchor: HTMLAnchorElement): boolean {
  return anchor.classList.contains('rs-wiki-redlink')
}

/** 是否应拦截 Wiki 内链点击（阻止浏览器/Halo 默认导航） */
export function shouldBlockEditorWikiLinkClick(
  anchor: HTMLAnchorElement,
  modClick: boolean
): boolean {
  if (isDomRedlinkAnchor(anchor)) return true
  if (!modClick) return true
  return !isEditorPublishedLinkNavEnabled()
}

/** 编辑页是否允许对当前链接执行 openWikiArchiveLinkFromEditor */
export function canOpenWikiLinkFromEditor(isRed: boolean): boolean {
  if (!isEditorConsolePage()) return true
  if (!isRed) return isEditorPublishedLinkNavEnabled()
  return isEditorRedlinkNavEnabled()
}

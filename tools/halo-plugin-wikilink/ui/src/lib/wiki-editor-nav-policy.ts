/**
 * 编辑页 Wiki 内链跳转/创建（Ctrl+点击、气泡「打开链接」）暂禁。
 * 红链创建与跳转仅由前台 rs-redlinks.js 负责；后续再恢复编辑器打开能力。
 */
export const EDITOR_WIKI_LINK_NAV_ENABLED = false

export function isEditorWikiLinkNavEnabled(): boolean {
  return EDITOR_WIKI_LINK_NAV_ENABLED
}

export function isEditorConsolePage(): boolean {
  return location.pathname.indexOf('/console/posts/editor') >= 0
}

export const EDITOR_WIKI_REDLINK_TITLE =
  '尚未发布 · 请在前台文章页点击红链创建'

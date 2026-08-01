import { defaultDragItems, type Editor } from '@halo-dev/richtext-editor'

/** 与 Halo EditorDragHandle 一致的块菜单项合并逻辑（简化类型） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DragMenuItem = Record<string, any>

function mergeDragItem(root: DragMenuItem, ext: DragMenuItem) {
  mergeVisible(root, ext)
  mergeActive(root, ext)
  mergeDisabled(root, ext)
  mergeAction(root, ext)
  mergeChildren(root, ext)
}

function mergeVisible(root: DragMenuItem, ext: DragMenuItem) {
  const ev = ext.visible
  const rv = root.visible
  root.visible = (ctx: unknown) => {
    if (ev?.(ctx) === false) return false
    return rv ? rv(ctx) : true
  }
}

function mergeActive(root: DragMenuItem, ext: DragMenuItem) {
  const ea = ext.isActive
  const ra = root.isActive
  root.isActive = (ctx: unknown) => {
    if (ea?.(ctx) === true) return true
    return ra ? ra(ctx) : false
  }
}

function mergeDisabled(root: DragMenuItem, ext: DragMenuItem) {
  const ed = ext.disabled
  const rd = root.disabled
  root.disabled = (ctx: unknown) => {
    if (ed?.(ctx) === true) return true
    return rd ? rd(ctx) : false
  }
}

function mergeAction(root: DragMenuItem, ext: DragMenuItem) {
  const ea = ext.action
  const ra = root.action
  if (!ea && !ra) return
  root.action = async (ctx: DragMenuItem) => {
    if (ea) {
      const r = await ea(ctx)
      if (r !== undefined) return r
    }
    if (ra) return ra(ctx)
  }
}

function mergeChildren(root: DragMenuItem, ext: DragMenuItem) {
  const items = ext.children?.items ?? []
  if (!items.length) return
  const merged = [...(root.children?.items ?? []), ...items].filter((item, idx, arr) =>
    item.key ? arr.findIndex((x) => x.key === item.key) === idx : true,
  )
  const roots = merged.filter((i) => !i.extendsKey?.trim())
  const extensions = merged.filter((i) => i.extendsKey?.trim())
  root.children = {
    ...root.children,
    items: sortByPriority(mergeDragItems(roots, extensions)),
  }
}

function mergeDragItems(roots: DragMenuItem[], extensions: DragMenuItem[]): DragMenuItem[] {
  const out: DragMenuItem[] = []
  const byKey = new Map<string, DragMenuItem[]>()
  for (const ext of extensions) {
    const key = ext.extendsKey as string
    byKey.set(key, [...(byKey.get(key) ?? []), ext])
  }
  for (const root of roots) {
    const key = root.key as string | undefined
    if (key) {
      for (const ext of byKey.get(key) ?? []) mergeDragItem(root, ext)
    }
    out.push(root)
  }
  return sortByPriority(out)
}

function sortByPriority(items: DragMenuItem[]): DragMenuItem[] {
  return [...items].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
}

export function collectDragMenuItems(editor: Editor): DragMenuItem[] {
  const roots: DragMenuItem[] = [...defaultDragItems]
  const extensions: DragMenuItem[] = []

  for (const extension of editor.extensionManager.extensions) {
    const getDraggableMenuItems = extension.options?.getDraggableMenuItems as
      | ((ctx: { editor: Editor }) => DragMenuItem | DragMenuItem[])
      | undefined
    if (!getDraggableMenuItems) continue
    const result = getDraggableMenuItems({ editor })
    const list = Array.isArray(result) ? result : [result]
    for (const item of list) {
      if (item?.extendsKey?.trim()) extensions.push(item)
      else roots.push(item)
    }
  }

  return mergeDragItems(roots, extensions)
}

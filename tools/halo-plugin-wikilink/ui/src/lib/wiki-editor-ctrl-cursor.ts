/** 按住 Ctrl/Cmd 时 Wiki 内链显示手型；否则保持文本编辑光标 */

let modNavActive = false
let bound = false

type CursorListeners = {
  keydown: (e: KeyboardEvent) => void
  keyup: (e: KeyboardEvent) => void
  mousemove: (e: MouseEvent) => void
  blur: () => void
}
let listeners: CursorListeners | null = null

function isEditorPage() {
  return location.pathname.indexOf('/console/posts/editor') >= 0
}

function syncCtrlNavClass() {
  document.querySelectorAll('.ProseMirror').forEach((el) => {
    el.classList.toggle('rs-wiki-ctrl-nav', modNavActive)
  })
}

function setModNavActive(active: boolean) {
  if (modNavActive === active) return
  modNavActive = active
  syncCtrlNavClass()
}

function refreshModNavFromEvent(e: { ctrlKey?: boolean; metaKey?: boolean }) {
  setModNavActive(!!(e.ctrlKey || e.metaKey))
}

export function bindWikiEditorCtrlCursor() {
  if (bound || !isEditorPage()) return
  bound = true
  modNavActive = false
  syncCtrlNavClass()

  const keydown = (e: KeyboardEvent) => {
    if (!isEditorPage()) return
    if (e.key === 'Control' || e.key === 'Meta' || e.ctrlKey || e.metaKey) {
      setModNavActive(true)
    }
  }

  const keyup = (e: KeyboardEvent) => {
    if (!isEditorPage()) return
    if (e.key === 'Control' || e.key === 'Meta' || !e.ctrlKey) {
      setModNavActive(e.ctrlKey || e.metaKey)
    }
  }

  const mousemove = (e: MouseEvent) => {
    if (!isEditorPage()) return
    if (!(e.target instanceof Element) || !e.target.closest('.ProseMirror')) return
    refreshModNavFromEvent(e)
  }

  const blur = () => setModNavActive(false)

  window.addEventListener('keydown', keydown, true)
  window.addEventListener('keyup', keyup, true)
  document.addEventListener('mousemove', mousemove, true)
  window.addEventListener('blur', blur)

  listeners = { keydown, keyup, mousemove, blur }
}

export function unbindWikiEditorCtrlCursor() {
  if (!bound) return
  bound = false
  modNavActive = false
  if (listeners) {
    window.removeEventListener('keydown', listeners.keydown, true)
    window.removeEventListener('keyup', listeners.keyup, true)
    document.removeEventListener('mousemove', listeners.mousemove, true)
    window.removeEventListener('blur', listeners.blur)
    listeners = null
  }
  document.querySelectorAll('.ProseMirror.rs-wiki-ctrl-nav').forEach((el) => {
    el.classList.remove('rs-wiki-ctrl-nav')
  })
}

// Home, End, Page Up and Page Down scroll the pane under the mouse (a list,
// a details box, a document, a side column), not the window, when nothing
// that takes typing has focus. A key a control already handled (a tab bar's
// Home and End) is left alone. Kept free of JSX so node can test it.
import { useEffect, type RefObject } from 'react'

const KEYS = new Set(['Home', 'End', 'PageUp', 'PageDown'])

// Where a pane scrolls to for a key, or null for any other key.
export function paneTop(key: string, top: number, height: number, scrollHeight: number): number | null {
  const page = Math.max(40, Math.round(height * 0.9))
  if (key === 'Home') return 0
  if (key === 'End') return scrollHeight
  if (key === 'PageDown') return top + page
  if (key === 'PageUp') return Math.max(0, top - page)
  return null
}

export const takesTyping = (el: Element | null) =>
  Boolean(el && (el.matches('input, textarea, select') || (el as HTMLElement).isContentEditable || el.closest('[contenteditable=""], [contenteditable="true"]')))

// The nearest pane at or above `el`, inside `root`, that scrolls up and down.
export function scrollPane(el: Element | null, root: Element): HTMLElement | null {
  for (let at = el; at && root.contains(at); at = at.parentElement) {
    const style = getComputedStyle(at)
    if (/(auto|scroll)/.test(style.overflowY) && at.scrollHeight > at.clientHeight + 1) return at as HTMLElement
    if (at === root) break
  }
  return null
}

export function usePaneKeys(root: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    if (!on) return
    let under: Element | null = null
    const onMove = (event: PointerEvent) => {
      under = event.target instanceof Element ? event.target : null
    }
    const onKey = (event: KeyboardEvent) => {
      if (!KEYS.has(event.key) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const box = root.current
      if (!box || !under || !box.contains(under) || takesTyping(document.activeElement)) return
      const pane = scrollPane(under, box)
      if (!pane) return
      const top = paneTop(event.key, pane.scrollTop, pane.clientHeight, pane.scrollHeight)
      if (top === null) return
      event.preventDefault()
      pane.scrollTop = top
    }
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerover', onMove, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerover', onMove, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [root, on])
}

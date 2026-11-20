// The plan view's left column sticks to the top of whatever scrolls the
// page and is never taller than that scroller's visible part, so it scrolls
// on its own. In Kiro Crew the scroller is the app page's own content pane
// (overflow-y: auto), not the window, and it is shorter than the window by
// the host's and the page's headers. Kept free of JSX so node can test it.

type Node = { parentElement: Node | null; clientHeight: number; getBoundingClientRect?: () => { top: number; bottom: number } }
type StyleOf = (node: Node) => { overflowY: string }

// The nearest ancestor that scrolls vertically. It counts before it
// overflows: the column mounts while the plan is still loading, when the
// pane is not yet taller than its content, and must still be measured
// against that pane rather than the window.
export function scrollParent<T extends Node>(el: T | null, styleOf: StyleOf = (node) => getComputedStyle(node as unknown as Element)): T | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    if (/(auto|scroll|overlay)/.test(styleOf(node).overflowY)) return node as T
  }
  return null
}

// The column's max height: the part of the scroller on screen, less a
// small gap; the window when nothing inside the page scrolls.
export function stickyHeight(parent: Node | null, windowHeight: number): number {
  let visible = windowHeight
  if (parent) {
    const rect = parent.getBoundingClientRect?.()
    const onScreen = rect ? Math.min(windowHeight, rect.bottom) - Math.max(0, rect.top) : parent.clientHeight
    visible = Math.min(parent.clientHeight || onScreen, onScreen)
  }
  return Math.max(240, Math.floor(visible - 16))
}

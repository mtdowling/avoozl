// The mark for the lines a task cites in a rendered file: a tinted band and
// an accent bar on the left, not a flash. The full-file reader
// (DocumentReader) uses it and scrolls the cited blocks into view, with no
// animation under prefers-reduced-motion.
import { citedNodes } from './task-api.ts'

export const CITED_CLASS = 'avoozl-cited'

// The mark's look: theme variables only, so it reads in light and dark.
export const CITED_STYLE = `
[data-cited="true"] { background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: inset 3px 0 0 var(--accent); border-radius: 4px; padding-left: 10px; }
`

// A rendered block's tag for citedNodes: Markdown draws headings as
// role="heading" with aria-level, so they read as h1 to h6.
export function blockTag(node: HTMLElement): string {
  return node.getAttribute('role') === 'heading' ? `h${node.getAttribute('aria-level') ?? '6'}` : node.tagName.toLowerCase()
}

// Mark the cited blocks under `root` and scroll `scroller` to the first.
// Returns the first marked element, or null.
export function markCited(root: HTMLElement, lineStart: number | null, lineEnd: number | null, still: boolean, scroller: HTMLElement | null = root) {
  const nodes = [...root.querySelectorAll<HTMLElement>('[data-line]')]
  for (const node of nodes) {
    node.classList.remove(CITED_CLASS)
    delete node.dataset.cited
  }
  const marked = citedNodes(
    nodes.map((n) => ({ line: Number(n.dataset.line), tag: blockTag(n) })),
    lineStart,
    lineEnd,
  ).map((i) => nodes[i])
  for (const node of marked) {
    node.classList.add(CITED_CLASS)
    node.dataset.cited = 'true'
  }
  const first = marked[0] ?? null
  if (first && scroller) {
    const top = first.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 24
    scroller.scrollTo?.({ top: Math.max(0, top), behavior: still ? 'auto' : 'smooth' })
  }
  return first
}

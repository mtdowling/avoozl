// A whole source file with the lines a task cites marked for good: a tinted
// band and an accent bar on the left, not a flash. The drawer's Came from
// section and the full-file reader both use it, so they mark the same
// blocks. It scrolls the cited blocks into view, with no animation under
// prefers-reduced-motion.
import { useEffect, useRef } from 'react'
import { Markdown } from './Markdown.tsx'
import { useMedia } from './use-media.ts'
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

export function CitedFile(props: { text: string; lineStart: number | null; lineEnd: number | null; maxHeight?: number | string; idPrefix?: string; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const still = useMedia('(prefers-reduced-motion: reduce)')
  const { text, lineStart, lineEnd } = props
  useEffect(() => {
    const root = box.current
    if (!root) return
    const frame = requestAnimationFrame(() => markCited(root, lineStart, lineEnd, still))
    return () => cancelAnimationFrame(frame)
  }, [text, lineStart, lineEnd, still])
  return (
    <div ref={box} data-cited-file aria-label={props.label} className="px-3 py-2" style={{ maxHeight: props.maxHeight ?? 420, overflowY: 'auto', overscrollBehavior: 'contain' }}>
      <style>{CITED_STYLE}</style>
      <Markdown text={text} idPrefix={props.idPrefix} />
    </div>
  )
}

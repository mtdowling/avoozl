// Has a detail pane's big title scrolled out of its scroller? Observes the
// title element rather than reading scroll offsets, so there is no threshold
// to tune and no scroll listener. The scroller is found from the title: the
// nearest ancestor that scrolls (the page's content pane).
import { useCallback, useEffect, useRef, useState } from 'react'
import { scrollParent } from './sticky-column.ts'

export function useTitleScrolledOut() {
  const [scrolledOut, setScrolledOut] = useState(false)
  const observer = useRef<IntersectionObserver | null>(null)
  const titleRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setScrolledOut(!entry.isIntersecting), { root: scrollParent(node), threshold: 0 })
    io.observe(node)
    observer.current = io
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  return { scrolledOut, titleRef }
}

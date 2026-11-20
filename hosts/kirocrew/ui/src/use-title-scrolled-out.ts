// Has a detail pane's big title scrolled out of its scroller? Observes the
// title element rather than reading scroll offsets, so there is no threshold
// to tune and no scroll listener. The viewport is the root: the browser clips
// the title's box by every scrolling ancestor (the page's content pane), so a
// title scrolled out of the pane counts as out.
import { useCallback, useEffect, useRef, useState } from 'react'

export function useTitleScrolledOut() {
  const [scrolledOut, setScrolledOut] = useState(false)
  const observer = useRef<IntersectionObserver | null>(null)
  const titleRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setScrolledOut(!entry.isIntersecting), { threshold: 0 })
    io.observe(node)
    observer.current = io
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  return { scrolledOut, titleRef }
}

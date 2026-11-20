// One line of text that, when it is too long for its box, fades out at the
// right edge and still ends in an ellipsis: the text is clipped under a mask
// that fades its last few characters, and a "…" follows the fade. Text that
// fits is drawn as is, with no fade and no ellipsis. The full text stays in
// the element, so a screen reader and a copy read all of it.
import { useEffect, useRef, useState } from 'react'

// The fade runs over the last 2.5em of the clipped text, theme-free: a mask
// only changes opacity, so it reads in light and dark.
export const FADE_TEXT_CSS = `[data-fade-text]{display:flex;align-items:baseline;min-width:0;max-width:100%;overflow:hidden}
[data-fade-text]>[data-fade-text-body]{flex:0 1 auto;min-width:0;overflow:hidden;white-space:nowrap}
[data-fade-text][data-clipped]>[data-fade-text-body]{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 2.5em),rgb(0 0 0 / .1));mask-image:linear-gradient(to right,#000 calc(100% - 2.5em),rgb(0 0 0 / .1))}
[data-fade-text]>[data-fade-text-more]{flex:none}`

export function FadeText(props: { children: string }) {
  const box = useRef<HTMLSpanElement>(null)
  const body = useRef<HTMLSpanElement>(null)
  const [clipped, setClipped] = useState(false)
  useEffect(() => {
    const outer = box.current,
      inner = body.current
    if (!outer || !inner) return
    // Clipped when the whole text is wider than the box: measured against
    // the box, not the text's own (narrower, once the ellipsis shows) width.
    const measure = () => setClipped(inner.scrollWidth > outer.clientWidth + 0.5)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    return () => observer.disconnect()
  }, [props.children])
  return (
    <span ref={box} data-fade-text="" data-clipped={clipped ? '' : undefined}>
      <style>{FADE_TEXT_CSS}</style>
      <span ref={body} data-fade-text-body="">
        {props.children}
      </span>
      {clipped && (
        <span data-fade-text-more="" aria-hidden="true">
          …
        </span>
      )}
    </span>
  )
}

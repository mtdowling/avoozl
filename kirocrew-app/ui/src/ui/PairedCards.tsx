// Two cards side by side that always share one height. The row is as tall as
// the taller card's content, up to about the window's height; past that,
// each card keeps its heading in place and scrolls its body inside itself,
// so a long list never makes the row taller. When stacked (`paired` false,
// e.g. on a phone) each card takes its natural height and nothing scrolls
// inside. A PairedCard outside PairedCards is a plain card.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Card } from './Card'
import { SectionHeading } from './controls.tsx'

const Paired = createContext(false)

// The tallest the row gets: the window less the page's heading and margins.
const ROW_MAX = 'max(16rem, calc(100dvh - 8rem))'

export function PairedCards(props: { paired: boolean; children: ReactNode; attrs?: Record<string, string>; style?: CSSProperties }) {
  const style: CSSProperties = props.paired
    ? { display: 'flex', alignItems: 'stretch', gap: 14, maxHeight: ROW_MAX, ...props.style }
    : { display: 'flex', flexDirection: 'column', gap: 14, ...props.style }
  return (
    <Paired.Provider value={props.paired}>
      <div data-paired-cards={props.paired ? 'row' : 'stack'} style={style} {...props.attrs}>
        {props.children}
      </div>
    </Paired.Provider>
  )
}

// `grow` is the card's share of the row's width; `minWidth` its narrowest;
// `width` a fixed width instead.
// With no `title` the card has no heading and its whole body scrolls.
// `style` changes the card's look (a tinted list panel).
export function PairedCard(props: { title?: ReactNode; label: string; meta?: ReactNode; grow?: number; minWidth?: string; width?: string; style?: CSSProperties; children?: ReactNode }) {
  const paired = useContext(Paired)
  const body = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = body.current
    if (!paired || !el || typeof ResizeObserver === 'undefined') return setScrolls(false)
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1)
    const watch = new ResizeObserver(check)
    watch.observe(el)
    for (const child of el.children) watch.observe(child)
    check()
    return () => watch.disconnect()
  }, [paired, props.children])
  const card: CSSProperties = { ...props.style, ...(paired ? { flex: props.width ? `0 0 ${props.width}` : `${props.grow ?? 1} 1 0`, minWidth: props.minWidth ?? 0, minHeight: 0, display: 'flex', flexDirection: 'column' } : { minWidth: 0 }) }
  return (
    <Card style={card}>
      {props.title ? <SectionHeading title={props.title} meta={props.meta} className="mb-2" /> : null}
      <div
        ref={body}
        data-paired-body
        role="region"
        aria-label={props.label}
        // A body that scrolls takes focus so the keyboard can scroll it.
        tabIndex={scrolls ? 0 : undefined}
        className="flex min-w-0 flex-col"
        style={paired ? { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' } : undefined}
      >
        {props.children}
      </div>
    </Card>
  )
}

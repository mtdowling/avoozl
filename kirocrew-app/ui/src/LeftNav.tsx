// The desktop's left nav (follows Kiro Crew's list-detail pattern and Issue
// Radar's sidebar): a top card (the workspace), then one card with an entry
// per page. Drag its edge to make it wider or narrower; drag it well
// past its minimum, or press Collapse, and it becomes a thin tall bar whose
// entries read as vertical text. Width and collapse are remembered.
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { NAV, NAV_COLLAPSE_AT, NAV_COLLAPSED_KEY, NAV_COLLAPSED_WIDTH, clampWidth, pageStorage, readFlag, readWidth, writeFlag, writeWidth } from './columns.ts'
import { ChevronRight } from './icons.ts'
import { ResizeHandle } from './ResizeHandle.tsx'

export interface NavItem {
  key: string
  // The entry as the expanded nav draws it (icon, word, count).
  label: ReactNode
  // The plain word, for the collapsed bar's vertical text.
  text: string
  count?: number
  aria?: string
}

// Issue Radar's sidebar cards, measured on the host: 12px corners, the
// elevated surface, a hairline border and a small shadow. The top card's
// border is the stronger one, and it is 42px tall (38px on a phone).
export const NAV_CARD = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-elevated)', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' } as const
export const TOP_CARD = { ...NAV_CARD, border: '1px solid var(--border-strong, var(--border))' } as const
// Radar's sidebar rows: 32px, 13px text, 8px corners.
export const NAV_ROW = 32

export function LeftNav(props: { items: NavItem[]; value: string; onChange: (key: string) => void; top?: ReactNode }) {
  const [width, setWidthState] = useState(() => readWidth(pageStorage(), NAV))
  const [collapsed, setCollapsedState] = useState(() => readFlag(pageStorage(), NAV_COLLAPSED_KEY))
  const root = useRef<HTMLElement>(null)
  const setCollapsed = (on: boolean) => {
    setCollapsedState(on)
    writeFlag(pageStorage(), NAV_COLLAPSED_KEY, on)
  }
  const resize = useCallback((next: number) => {
    if (next < NAV_COLLAPSE_AT) {
      setCollapsedState(true)
      writeFlag(pageStorage(), NAV_COLLAPSED_KEY, true)
      return
    }
    const value = clampWidth(NAV, next)
    setWidthState(value)
    writeWidth(pageStorage(), NAV, value)
  }, [])
  const tab = (item: NavItem, vertical: boolean) => {
    const selected = item.key === props.value
    return (
      <button
        key={item.key}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-label={vertical ? (item.aria ?? item.text) : item.aria}
        data-nav-item={item.key}
        onClick={() => props.onChange(item.key)}
        style={
          vertical
            ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '10px 0', width: '100%', background: selected ? 'var(--accent-subtle, var(--bg-hover, var(--bg-elevated)))' : 'none', border: 0, borderRadius: 6, color: selected ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontSize: 12.5, fontWeight: selected ? 600 : 500, whiteSpace: 'nowrap' }
            : { display: 'flex', alignItems: 'center', width: '100%', height: NAV_ROW, padding: '0 12px', background: selected ? 'var(--accent-subtle, var(--bg-hover, var(--bg-elevated)))' : 'none', border: 0, borderRadius: 8, color: selected ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontSize: 13, fontWeight: selected ? 600 : 400, textAlign: 'left' }
        }
      >
        {vertical ? (
          <>
            {item.text}
            {item.count ? ` ${item.count}` : ''}
          </>
        ) : (
          item.label
        )}
      </button>
    )
  }
  if (collapsed)
    return (
      <nav ref={root} aria-label="Avoozl pages" data-left-nav="collapsed" data-top-row style={{ flex: `0 0 ${NAV_COLLAPSED_WIDTH}px`, width: NAV_COLLAPSED_WIDTH, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '4px 2px', borderRight: '1px solid var(--border)', minHeight: 0, overflowY: 'auto' }}>
        <button type="button" aria-label="Expand the nav" data-nav-expand onClick={() => setCollapsed(false)} style={{ display: 'flex', justifyContent: 'center', padding: '6px 0', background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer' }}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <div role="tablist" aria-orientation="vertical" aria-label="Avoozl views" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {props.items.map((item) => tab(item, true))}
        </div>
      </nav>
    )
  return (
    <>
      <nav ref={root} aria-label="Avoozl pages" data-left-nav="open" data-top-row style={{ flex: `0 0 ${width}px`, width, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 8px 4px 0', minHeight: 0, overflowY: 'auto' }}>
        {props.top}
        <div role="tablist" aria-orientation="vertical" aria-label="Avoozl views" data-nav-card style={{ ...NAV_CARD, display: 'flex', flexDirection: 'column', gap: 2, padding: 4 }}>
          {props.items.map((item) => tab(item, false))}
        </div>
        <button type="button" aria-label="Collapse the nav" data-nav-collapse onClick={() => setCollapsed(true)} style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
            <ChevronRight size={14} />
          </span>
          Collapse
        </button>
      </nav>
      <ResizeHandle
        label="Resize the nav"
        width={width}
        min={NAV.min}
        max={NAV.max}
        left={() => root.current?.getBoundingClientRect().left ?? 0}
        onResize={resize}
        onReset={() => resize(NAV.initial)}
      />
    </>
  )
}

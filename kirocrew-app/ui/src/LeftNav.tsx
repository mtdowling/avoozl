// The desktop's left nav (follows Kiro Crew's list-detail pattern and Issue
// Radar's sidebar): one card with an entry per page, a small card of line controls,
// then the brand card. Drag its edge to make it wider or narrower; drag it well
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
// border is the stronger one. Buttons in them keep Kiro Crew's compact size
// (28px at most) on every screen: there is no tall tap size.
export const NAV_CARD = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-elevated)', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' } as const
export const TOP_CARD = { ...NAV_CARD, border: '1px solid var(--border-strong, var(--border))' } as const
// A nav row: 13px text and 8px corners as in Radar's sidebar, at the
// compact 28px button height.
export const NAV_ROW = 28
// The nav's small icon buttons (Stop the line, Refresh): 28px, icon only.
export const NAV_ICON = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' } as const
// The small section under the nav card that holds those icons, drawn only
// when there is something to put in it.
export function NavLine(props: { children: ReactNode }) {
  return (
    <div data-nav-line style={{ ...NAV_CARD, display: 'flex', alignItems: 'center', gap: 6, padding: 4 }}>
      {props.children}
    </div>
  )
}

// Hover and keyboard focus, from Kiro Crew's theme variables as in Issue
// Radar's sidebar. The selected item keeps its accent color and tint, and a
// hover on it only deepens the tint, so the two stay apart.
const NAV_CSS = `[data-nav-item]{background:none;color:var(--muted);transition:background-color .12s,color .12s}
[data-nav-item]:not([data-selected]):hover{background:var(--bg-hover);color:var(--text)}
[data-nav-item][data-selected]{background:var(--accent-subtle,var(--bg-hover,var(--bg-elevated)));color:var(--accent)}
[data-nav-item][data-selected]:hover{background:color-mix(in srgb,var(--accent) 18%,var(--bg-elevated))}
[data-nav-item]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
@media (prefers-reduced-motion:reduce){[data-nav-item]{transition:none}}`

export function LeftNav(props: { items: NavItem[]; value: string; onChange: (key: string) => void; line?: ReactNode; brand?: ReactNode }) {
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
        data-selected={selected ? '' : undefined}
        onClick={() => props.onChange(item.key)}
        style={
          vertical
            ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '10px 0', width: '100%', border: 0, borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: selected ? 600 : 500, whiteSpace: 'nowrap' }
            : { display: 'flex', alignItems: 'center', width: '100%', height: NAV_ROW, padding: '0 12px', border: 0, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: selected ? 600 : 400, textAlign: 'left' }
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
        <style>{NAV_CSS}</style>
        <button type="button" aria-label="Expand the nav" data-nav-expand onClick={() => setCollapsed(false)} style={{ display: 'flex', justifyContent: 'center', padding: '6px 0', background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer' }}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <div role="tablist" aria-orientation="vertical" aria-label="Avoozl views" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {props.items.map((item) => tab(item, true))}
        </div>
        {props.line}
      </nav>
    )
  return (
    <>
      <style>{NAV_CSS}</style>
      <nav ref={root} aria-label="Avoozl pages" data-left-nav="open" data-top-row style={{ flex: `0 0 ${width}px`, width, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 8px 4px 0', minHeight: 0, overflowY: 'auto' }}>
        <div role="tablist" aria-orientation="vertical" aria-label="Avoozl views" data-nav-card style={{ ...NAV_CARD, display: 'flex', flexDirection: 'column', gap: 2, padding: 4 }}>
          {props.items.map((item) => tab(item, false))}
        </div>
        {props.line}
        {props.brand}
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

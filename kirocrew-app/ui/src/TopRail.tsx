// The phone's navigation, from Kiro Crew's list-detail pattern: a thin bar
// across the top that names where you are. Opening it takes the whole page
// for the list of sections, and picking one closes it again. A desktop keeps
// its tab row, so the page renders this only on a phone.
import type { ReactNode } from 'react'
import { ChevronRight } from './icons.ts'

export interface RailItem {
  key: string
  label: ReactNode
  // Words for a screen reader when the label carries a count.
  aria?: string
}

export function TopRail(props: {
  items: RailItem[]
  value: string
  onChange: (key: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  ariaLabel: string
}) {
  const current = props.items.find((item) => item.key === props.value)
  const pick = (key: string) => {
    props.onChange(key)
    props.onOpenChange(false)
  }
  return (
    <>
      <button
        type="button"
        data-top-rail-bar
        aria-expanded={props.open}
        aria-controls="avoozl-top-rail-list"
        onClick={() => props.onOpenChange(!props.open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '3px 16px', background: 'var(--bg-elevated)', border: 0, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', color: 'inherit', cursor: 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left' }}
      >
        <span style={{ minWidth: 0, flex: 1 }}>{current?.label}</span>
        <span aria-hidden="true" style={{ display: 'inline-flex', transform: props.open ? 'rotate(-90deg)' : 'rotate(90deg)' }}>
          <ChevronRight size={16} />
        </span>
      </button>
      {props.open && (
        <div
          id="avoozl-top-rail-list"
          role="tablist"
          aria-label={props.ariaLabel}
          data-top-rail-list
          style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        >
          {props.items.map((item) => {
            const selected = item.key === props.value
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={item.aria}
                onClick={() => pick(item.key)}
                style={{ display: 'flex', alignItems: 'center', padding: '3px 16px', background: selected ? 'var(--bg-elevated)' : 'none', border: 0, borderBottom: '1px solid var(--border)', color: selected ? 'var(--accent)' : 'var(--text)', cursor: 'pointer', fontSize: 15, textAlign: 'left' }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

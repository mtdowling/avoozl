// The phone's navigation, from Kiro Crew's list-detail pattern: a hamburger
// in the thin bar under the host's top bar names where you are. Opening it
// takes the whole page for the list of sections, and picking one closes it
// again. A desktop has the left nav instead.
import type { ReactNode } from 'react'
import { Menu, X } from './icons.ts'

export interface RailItem {
  key: string
  label: ReactNode
  // Words for a screen reader when the label carries a count.
  aria?: string
}

// The hamburger and the current page's name, for the phone's header row.
export function RailButton(props: { items: RailItem[]; value: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const current = props.items.find((item) => item.key === props.value)
  return (
    <button
      type="button"
      data-top-rail-bar
      aria-expanded={props.open}
      aria-controls="avoozl-top-rail-list"
      aria-label={props.open ? 'Close the menu' : 'Open the menu'}
      onClick={() => props.onOpenChange(!props.open)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto', height: 28, padding: '0 6px', background: 'none', border: 0, color: 'inherit', cursor: 'pointer', fontSize: 15, fontWeight: 600, textAlign: 'left' }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}>
        {props.open ? <X size={20} /> : <Menu size={20} />}
      </span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label}</span>
    </button>
  )
}

// The full-page list a phone's hamburger opens.
export function RailList(props: { items: RailItem[]; value: string; onChange: (key: string) => void; onOpenChange: (open: boolean) => void; ariaLabel: string }) {
  return (
    <div id="avoozl-top-rail-list" role="tablist" aria-label={props.ariaLabel} data-top-rail-list data-top-row style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
      {props.items.map((item) => {
        const selected = item.key === props.value
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={item.aria}
            onClick={() => {
              props.onChange(item.key)
              props.onOpenChange(false)
            }}
            style={{ display: 'flex', alignItems: 'center', height: 28, margin: '6px 0', padding: '0 16px', background: selected ? 'var(--bg-elevated)' : 'none', border: 0, borderBottom: '1px solid var(--border)', color: selected ? 'var(--accent)' : 'var(--text)', cursor: 'pointer', fontSize: 15, textAlign: 'left' }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

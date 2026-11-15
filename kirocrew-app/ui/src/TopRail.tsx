// The phone's navigation, from Kiro Crew's list-detail pattern and Issue
// Radar's phone top card: one card under the host's top bar names where you
// are, with the open-the-list icon at its right. It is a compact 28px button. Opening it
// takes the whole page for the list of sections, and picking one closes it
// again. A desktop has the left nav instead.
import type { ReactNode } from 'react'
import { PanelLeftOpen, X } from './icons.ts'
import { TOP_CARD } from './LeftNav.tsx'
import { NavAccordion, type NavGroup } from './NavAccordion.tsx'

// The current page's name and the open-the-list icon, for the phone's header row.
export function RailButton(props: { groups: NavGroup[]; value: string; child?: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const current = props.groups.find((group) => group.key === props.value)
  const sub = current?.children?.find((item) => item.key === props.child)
  return (
    <button
      type="button"
      data-top-rail-bar
      aria-expanded={props.open}
      aria-controls="avoozl-top-rail-list"
      aria-label={props.open ? 'Close the menu' : 'Open the menu'}
      onClick={() => props.onOpenChange(!props.open)}
      style={{ ...TOP_CARD, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto', height: 28, boxSizing: 'border-box', padding: '0 10px', color: 'inherit', cursor: 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left' }}
    >
      <span style={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label}{sub && <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · {sub.label}</span>}</span>
      <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--muted)' }}>
        {props.open ? <X size={16} /> : <PanelLeftOpen size={16} />}
      </span>
    </button>
  )
}

// The full-page menu a phone's hamburger opens: the same accordion as the
// desktop's left nav, with the line controls and brand card at the bottom.
export function RailList(props: { groups: NavGroup[]; value: string; child?: string | null; onPick: (key: string, child?: string) => void; onOpenChange: (open: boolean) => void; footer?: ReactNode }) {
  return (
    <div id="avoozl-top-rail-list" data-top-rail-list data-top-row style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '8px 8px 0' }}>
      <NavAccordion groups={props.groups} value={props.value} child={props.child} onPick={props.onPick} onDone={() => props.onOpenChange(false)} />
      {props.footer && (
        <div data-top-rail-footer style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0' }}>
          {props.footer}
        </div>
      )}
    </div>
  )
}

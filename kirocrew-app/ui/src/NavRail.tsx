// A page's sort and filters as rows and chips in the left nav, drawn as
// Issue Radar's Issues rail draws them: small uppercase headers with an
// icon, a list of sort rows (the active one filled, with its direction),
// filter rows that toggle, thin dividers between groups, and soft pills with
// a count for one value each. No dropdowns: every choice is a button with
// aria-pressed. Colors are Kiro Crew's theme variables only.
import { useMemo, useState, type ReactNode } from 'react'
import { NAV_PILL } from './nav-style.ts'
import { ArrowDown, ArrowUp, Search, X, type LucideIcon } from './icons.ts'

// Radar's sizes: 12px headers at .05em, 13px rows 8px in, 6px corners.
const CSS = `[data-rail-head]{display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
[data-rail-row]{display:flex;align-items:center;gap:8px;width:100%;min-width:0;box-sizing:border-box;height:${NAV_PILL}px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--muted);font:inherit;font-size:13px;text-align:left;cursor:pointer;transition:background-color .12s,color .12s}
[data-rail-row]:hover{background:var(--bg-hover);color:var(--text)}
[data-rail-row][aria-pressed=true]{background:var(--accent-subtle,var(--bg-hover));color:var(--text);font-weight:500}
[data-rail-row][aria-pressed=true]:hover{background:color-mix(in srgb,var(--accent) 18%,var(--bg-elevated))}
[data-rail-row]:disabled{opacity:.4;cursor:default}
[data-rail-chip]{display:inline-flex;align-items:center;gap:8px;max-width:100%;box-sizing:border-box;padding:4px 12px;border:0;border-radius:999px;color:var(--text);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background-color .12s}
[data-rail-chip][aria-pressed=true]{font-weight:700}
[data-rail-icon]{display:inline-flex;padding:2px;border:0;border-radius:4px;background:none;color:var(--muted);cursor:pointer}
[data-rail-icon]:hover{color:var(--text);background:var(--bg-hover)}
[data-rail-icon][aria-expanded=true]{color:var(--accent)}
[data-rail-row]:focus-visible,[data-rail-chip]:focus-visible,[data-rail-icon]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
[data-rail-text]{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`

export function RailStyle() {
  return <style>{CSS}</style>
}

// One block: its header (icon, title, an optional control on the right),
// then its rows. Blocks after the first sit 20px lower, as in Radar.
export function RailBlock(props: { icon: LucideIcon; title: string; first?: boolean; action?: ReactNode; children: ReactNode; id?: string }) {
  const Icon = props.icon
  return (
    <div data-rail-section={props.id} style={{ paddingTop: props.first ? 0 : 20 }}>
      <div data-rail-head>
        <Icon size={12} aria-hidden="true" />
        <span>{props.title}</span>
        {props.action && <span style={{ marginLeft: 'auto', display: 'inline-flex', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>{props.action}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{props.children}</div>
    </div>
  )
}

// A filter row: filled while on. `icon` is for a sort row.
export function RailRow(props: { label: string; active: boolean; onClick: () => void; icon?: LucideIcon; trail?: ReactNode; disabled?: boolean; attrs?: Record<string, string> }) {
  const Icon = props.icon
  return (
    <button type="button" data-rail-row aria-pressed={props.active} disabled={props.disabled} onClick={props.onClick} {...props.attrs}>
      {Icon && <Icon size={14} aria-hidden="true" style={{ flexShrink: 0 }} />}
      <span data-rail-text>{props.label}</span>
      {props.trail}
    </button>
  )
}

export function RailDivider() {
  return <div role="separator" style={{ margin: '4px 0', borderTop: '1px solid var(--border)' }} />
}

export interface RailSort<K extends string> {
  key: K
  label: string
  icon: LucideIcon
}

// The sort list: picking the active field flips its direction; another
// field takes over with its own first direction.
export function RailSortList<K extends string>(props: { fields: RailSort<K>[]; sort: K; dir: 'asc' | 'desc'; onSort: (key: K) => void }) {
  const Dir = props.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <>
      {props.fields.map((field) => {
        const on = field.key === props.sort
        return (
          <RailRow
            key={field.key}
            label={field.label}
            icon={field.icon}
            active={on}
            onClick={() => props.onSort(field.key)}
            attrs={{ 'data-rail-sort': field.key }}
            trail={
              on ? (
                <>
                  <Dir size={14} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--accent)' }} />
                  <span className="sr-only">{props.dir === 'asc' ? ', ascending' : ', descending'}</span>
                </>
              ) : undefined
            }
          />
        )
      })}
    </>
  )
}

// Soft pill colors, by place in the list: Kiro Crew's tile colors at a
// light tint, the full mix while picked.
const TILES = ['purple', 'blue', 'green', 'orange', 'teal', 'pink', 'indigo', 'red']
const tint = (at: number, picked: boolean) => `color-mix(in srgb, var(--tile-${TILES[at % TILES.length]}) ${picked ? 45 : 16}%, transparent)`

export interface RailChipItem {
  value: string
  label: string
  count: number
}

// A titled block of pills with a search icon that narrows them. Search is
// local: it hides pills, it never sets the filter.
export function RailChips(props: { id: string; icon: LucideIcon; title: string; noun: string; items: RailChipItem[]; picked: string | undefined; onPick: (value: string | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return props.items.filter((item) => !q || item.label.toLowerCase().includes(q))
  }, [props.items, query])
  if (props.items.length === 0) return null
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  return (
    <RailBlock
      id={props.id}
      icon={props.icon}
      title={props.title}
      action={
        <button type="button" data-rail-icon aria-expanded={open} aria-label={open ? `Close ${props.noun} search` : `Search ${props.noun}s`} onClick={() => (open ? close() : setOpen(true))}>
          <Search size={13} aria-hidden="true" />
        </button>
      }
    >
      {open && (
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <input
            autoFocus
            type="text"
            value={query}
            aria-label={`Search ${props.noun}s`}
            placeholder={`Search ${props.noun}s…`}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && close()}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 28px 6px 12px', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
          />
          <button type="button" data-rail-icon aria-label={`Close ${props.noun} search`} onClick={close} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        {shown.map((item) => {
          const at = props.items.indexOf(item)
          const picked = props.picked === item.value
          return (
            <button
              key={item.value}
              type="button"
              data-rail-chip={item.value}
              aria-pressed={picked}
              aria-label={`${item.label}, ${item.count}`}
              onClick={() => props.onPick(picked ? undefined : item.value)}
              style={{ background: tint(at, picked) }}
            >
              <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', flexShrink: 0, opacity: picked ? 0.9 : 0.6 }}>{item.count}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            </button>
          )
        })}
      </div>
      {open && shown.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No {props.noun} matches “{query}”.</div>}
    </RailBlock>
  )
}

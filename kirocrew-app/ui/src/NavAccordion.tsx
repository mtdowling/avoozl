// Issue Radar's nav model: a stack of section cards, each a header button
// (icon, word, chevron) that opens like an accordion, one open at a time. An
// open section lists its sub-pages as items in the nav itself; a section with
// no sub-pages is a header that goes straight to its page. Used by the
// desktop's left nav and by the phone's menu. Sizes follow Radar's sidebar
// (12px uppercase headers, 13px items, 16px cards) at Kiro Crew's compact
// 28px button height.
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from './icons.ts'
import { NAV_ROW } from './nav-style.ts'

export interface NavChild {
  key: string
  label: string
}

export interface NavGroup {
  key: string
  // The plain word, for the collapsed bar and the phone's menu button.
  text: string
  // The header as drawn (icon, word, count).
  label: ReactNode
  aria?: string
  children?: NavChild[]
}

const CARD = { position: 'relative', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-elevated)', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)', flexShrink: 0 } as const

// Hover and keyboard focus use Kiro Crew's theme variables, as in Radar's
// sidebar. The selected item keeps its tint; a hover on it only deepens it.
export const NAV_CSS = `[data-nav-head]{display:flex;align-items:center;gap:6px;width:100%;height:${NAV_ROW}px;padding:0 12px;border:0;background:none;color:var(--muted);font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;text-align:left;cursor:pointer;transition:background-color .12s,color .12s}
[data-nav-head]:hover{color:var(--text)}
[data-nav-head][data-open],[data-nav-head][data-selected]{color:var(--text)}
[data-nav-head][data-selected]{background:var(--accent-subtle,var(--bg-hover,var(--bg-elevated)))}
[data-nav-head][data-selected]:hover{background:color-mix(in srgb,var(--accent) 18%,var(--bg-elevated))}
[data-nav-item]:not([data-nav-head]){display:flex;align-items:center;gap:8px;width:100%;height:${NAV_ROW}px;padding:0 8px;border:0;border-radius:8px;background:none;color:var(--muted);font-size:13px;text-align:left;cursor:pointer;transition:background-color .12s,color .12s}
[data-nav-item]:not([data-nav-head]):hover{background:var(--bg-hover);color:var(--text)}
[data-nav-item]:not([data-nav-head])[data-selected]{background:var(--accent-subtle,var(--bg-hover,var(--bg-elevated)));color:var(--text);font-weight:500}
[data-nav-item]:not([data-nav-head])[data-selected]:hover{background:color-mix(in srgb,var(--accent) 18%,var(--bg-elevated))}
[data-nav-head]:focus-visible,[data-nav-item]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
[data-nav-chevron]{display:inline-flex;flex-shrink:0;transition:transform .15s}
@media (prefers-reduced-motion:reduce){[data-nav-head],[data-nav-item],[data-nav-chevron]{transition:none}}`

export function NavAccordion(props: {
  groups: NavGroup[]
  // The page and, for a section with sub-pages, the sub-page that is showing.
  value: string
  child?: string | null
  onPick: (key: string, child?: string) => void
  // Called after a pick, so a phone's menu can close.
  onDone?: () => void
}) {
  const hasKids = (key: string) => Boolean(props.groups.find((g) => g.key === key)?.children?.length)
  // One section is open; going to a page without sub-pages closes it.
  const [open, setOpen] = useState<string | null>(hasKids(props.value) ? props.value : null)
  useEffect(() => setOpen(hasKids(props.value) ? props.value : null), [props.value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-nav-card data-nav-accordion role="group" aria-label="Avoozl pages" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{NAV_CSS}</style>
      {props.groups.map((group) => {
        const kids = group.children
        const expanded = Boolean(kids) && open === group.key
        const here = props.value === group.key
        return (
          <div key={group.key} data-nav-section={group.key} data-open={expanded ? '' : undefined} style={CARD}>
            <button
              type="button"
              data-nav-head
              {...(kids ? { 'data-nav-group': group.key } : { 'data-nav-item': group.key, 'data-nav-leaf': '' })}
              data-open={expanded ? '' : undefined}
              data-selected={!kids && here ? '' : undefined}
              aria-label={group.aria}
              aria-expanded={kids ? expanded : undefined}
              aria-current={!kids && here ? 'page' : undefined}
              onClick={() => {
                if (!kids) {
                  props.onPick(group.key)
                  props.onDone?.()
                } else if (expanded) setOpen(null)
                else {
                  setOpen(group.key)
                  if (!here) props.onPick(group.key)
                }
              }}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>{group.label}</span>
              {kids && (
                <span aria-hidden="true" data-nav-chevron style={{ transform: expanded ? 'none' : 'rotate(-90deg)' }}>
                  <ChevronDown size={14} />
                </span>
              )}
            </button>
            {expanded && kids && (
              <div data-nav-children={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 8px 8px' }}>
                {kids.map((item) => {
                  const selected = here && props.child === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      data-nav-item={`${group.key}/${item.key}`}
                      data-selected={selected ? '' : undefined}
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => {
                        props.onPick(group.key, item.key)
                        props.onDone?.()
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Issue Radar's nav model: a stack of section cards, each a header button
// (icon, word, chevron) that opens like an accordion, one open at a time. An
// open section lists its sub-pages as items in the nav itself; a section with
// no sub-pages is a header that goes straight to its page. Used by the
// desktop's left nav and by the phone's menu. Sizes follow Radar's sidebar
// (12px uppercase headers, 13px items, 16px cards) at Kiro Crew's compact
// 28px button height.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavSlotHost } from './nav-slot.tsx'
import { ChevronDown } from './icons.ts'
import { NAV_PILL } from './nav-style.ts'

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
  // The page draws its own controls (its filters) into the open section,
  // through NavSlotFor (nav-slot.tsx). A section with a slot opens like one
  // with sub-pages.
  slot?: boolean
}

const CARD = { position: 'relative', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-elevated)', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)', flexShrink: 0 } as const
// Open sections share the height the closed ones leave, so the nav always
// ends at the bottom, as in Radar's rail. A short one shows its background
// to the bottom edge; a tall one scrolls its body. Closed sections keep
// their own height.
const OPEN_MIN = 96
const OPEN_CARD = { ...CARD, flex: '1 1 0%', minHeight: OPEN_MIN, display: 'flex', flexDirection: 'column' } as const
// Sub-pages and slot content line up with the header: 12px in from the
// card, like the header's own icon; a row's text is 8px further in.
const BODY = { display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 12px 8px', minHeight: 0, flex: '1 1 auto', overflowY: 'auto' } as const

// Hover and keyboard focus use Kiro Crew's theme variables, as in Radar's
// sidebar. The selected item keeps its tint; a hover on it only deepens it.
export const NAV_CSS = `[data-nav-head]{display:flex;align-items:center;gap:6px;width:100%;min-width:0;flex-shrink:0;box-sizing:border-box;height:${NAV_PILL}px;padding:0 12px;border:0;background:none;color:var(--muted);font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;text-align:left;cursor:pointer;transition:background-color .12s,color .12s}
[data-nav-head]:hover{color:var(--text)}
[data-nav-head][data-open],[data-nav-head][data-selected]{color:var(--text)}
[data-nav-head][data-selected]{background:var(--accent-subtle,var(--bg-hover,var(--bg-elevated)))}
[data-nav-head][data-selected]:hover{background:color-mix(in srgb,var(--accent) 18%,var(--bg-elevated))}
[data-nav-item]:not([data-nav-head]){display:flex;align-items:center;gap:8px;width:100%;min-width:0;flex-shrink:0;box-sizing:border-box;height:${NAV_PILL}px;padding:0 8px;border:0;border-radius:8px;background:none;color:var(--muted);font-size:13px;text-align:left;cursor:pointer;transition:background-color .12s,color .12s}
[data-nav-text]{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-nav-item]:not([data-nav-head]):hover{background:var(--bg-hover);color:var(--text)}
[data-nav-item]:not([data-nav-head])[data-selected]{background:var(--accent-subtle,var(--bg-hover,var(--bg-elevated)));color:var(--text);font-weight:500}
[data-nav-item]:not([data-nav-head])[data-selected]:hover{background:color-mix(in srgb,var(--accent) 18%,var(--bg-elevated))}
[data-nav-head]:focus-visible,[data-nav-item]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
[data-nav-filters]>label{max-width:none!important;width:100%}
[data-nav-filters] label{font-size:12px}
[data-nav-filters] label>span:first-child,[data-nav-filters] legend{color:var(--muted)}
[data-nav-filters]>label select,[data-nav-filters] input[type=search],[data-nav-filters] input[type=text]{width:100%;min-width:0;box-sizing:border-box;font-size:12.5px}
[data-nav-chevron]{display:inline-flex;flex-shrink:0;transition:transform .15s}
@media (prefers-reduced-motion:reduce){[data-nav-head],[data-nav-item],[data-nav-filters]>label{max-width:none!important;width:100%}
[data-nav-filters] label{font-size:12px}
[data-nav-filters] label>span:first-child,[data-nav-filters] legend{color:var(--muted)}
[data-nav-filters]>label select,[data-nav-filters] input[type=search],[data-nav-filters] input[type=text]{width:100%;min-width:0;box-sizing:border-box;font-size:12.5px}
[data-nav-chevron]{transition:none}}`

export function NavAccordion(props: {
  groups: NavGroup[]
  // The page and, for a section with sub-pages, the sub-page that is showing.
  value: string
  child?: string | null
  onPick: (key: string, child?: string) => void
  // Called after a pick, so a phone's menu can close.
  onDone?: () => void
}) {
  const opens = (group: NavGroup | undefined) => Boolean(group?.children?.length || group?.slot)
  const hasKids = (key: string) => opens(props.groups.find((g) => g.key === key))
  const slots = useNavSlotHost()
  // One ref callback per section, kept across renders, so React does not
  // detach and attach the slot on every render.
  const slotRefs = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const slotRef = (key: string) => {
    let ref = slotRefs.current.get(key)
    if (!ref) slotRefs.current.set(key, (ref = (el) => slots?.register(key, el)))
    return ref
  }
  // One section is open at most. Going to a page opens its section, if it
  // has one, and shuts every other; opening one by hand shuts the rest. A
  // section with only a slot draws only while its page is showing, as its
  // filters are that page's.
  const [open, setOpen] = useState<string | null>(hasKids(props.value) ? props.value : null)
  useEffect(() => setOpen(hasKids(props.value) ? props.value : null), [props.value]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (group: NavGroup) => opens(group) && open === group.key && (props.value === group.key || !group.slot || Boolean(group.children?.length))
  // The least height the sections need: open ones their minimum, closed ones
  // their head. Below it the nav scrolls; above it the open ones stretch.
  const least = props.groups.reduce((sum, group) => sum + (shown(group) ? OPEN_MIN : NAV_PILL + 2), 8 * (props.groups.length - 1))
  return (
    <div data-nav-card data-nav-accordion role="group" aria-label="Avoozl pages" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minHeight: least }}>
      <style>{NAV_CSS}</style>
      {props.groups.map((group) => {
        const kids = opens(group) ? (group.children ?? []) : null
        const here = props.value === group.key
        const expanded = Boolean(kids) && shown(group)
        return (
          <div key={group.key} data-nav-section={group.key} data-open={expanded ? '' : undefined} style={expanded ? OPEN_CARD : CARD}>
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
              <span data-nav-label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>{group.label}</span>
              {kids && (
                <span aria-hidden="true" data-nav-chevron style={{ transform: expanded ? 'none' : 'rotate(-90deg)' }}>
                  <ChevronDown size={14} />
                </span>
              )}
            </button>
            {expanded && kids && (
              <div data-nav-children={group.key} style={BODY}>
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
                      <span data-nav-text>{item.label}</span>
                    </button>
                  )
                })}
                {group.slot && <div data-nav-slot={group.key} ref={slotRef(group.key)} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: kids.length ? 6 : 2 }} />}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

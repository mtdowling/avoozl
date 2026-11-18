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
import Badge from './ui/Badge.tsx'
import { Box } from './ui/Box'
import { NavStyle } from './ui/PageStyles'

export interface NavChild {
  key: string
  label: string
  count?: number
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
      <NavStyle />
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
              <Box data-nav-label as="span" css-flex="1" css-min-width="0" css-display="flex" css-align-items="center" css-overflow="hidden">{group.label}</Box>
              {kids && (
                <Box aria-hidden="true" data-nav-chevron as="span" css-transform={expanded ? 'none' : 'rotate-90deg'}>
                  <ChevronDown size={14} />
                </Box>
              )}
            </button>
            {expanded && kids && (
              <Box data-nav-children={group.key} css-display="flex" css-flex-direction="column" css-gap="2" css-padding="2px-12px-8px" css-min-height="0" css-flex="1-1-auto" css-overflow-y="auto">
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
                      {item.count ? <Box data-nav-count as="span" css-flex-shrink="0" css-display="inline-flex"><Badge variant="warning">{item.count}</Badge></Box> : null}
                    </button>
                  )
                })}
                {group.slot && <div data-nav-slot={group.key} ref={slotRef(group.key)} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: kids.length ? 6 : 2 }} />}
              </Box>
            )}
          </div>
        )
      })}
    </div>
  )
}

// A page's sort and filters as rows and chips in the left nav, drawn as
// Issue Radar's Issues rail draws them: small uppercase headers with an
// icon, a list of sort rows (the active one filled, with its direction),
// filter rows that toggle, thin dividers between groups, and soft pills with
// a count for one value each. No dropdowns: every choice is a button with
// aria-pressed. Colors are Kiro Crew's theme variables only.
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Search, X, type LucideIcon } from './icons.ts'
import { Box } from './ui/Box'
import { RailCss } from './ui/PageStyles'
import { PlainButton, PlainInput } from './ui/Plain'
import { Glyph } from './ui/Glyph'

export function RailStyle() {
  return <RailCss />
}

// One block: its header (icon, title, an optional control on the right),
// then its rows. Blocks after the first sit 20px lower, as in Radar.
export function RailBlock(props: { icon: LucideIcon; title: string; first?: boolean; action?: ReactNode; children: ReactNode; id?: string }) {
  const Icon = props.icon
  return (
    <Box data-rail-section={props.id} css-padding-top={props.first ? '0' : '20'}>
      <div data-rail-head>
        <Icon size={12} aria-hidden="true" />
        <span>{props.title}</span>
        {props.action && (
          <Box as="span" css-margin-left="auto" css-display="inline-flex" css-text-transform="none" css-letter-spacing="0" css-font-weight="400">
            {props.action}
          </Box>
        )}
      </div>
      <Box css-display="flex" css-flex-direction="column" css-gap="2">
        {props.children}
      </Box>
    </Box>
  )
}

// A filter row: filled while on. `icon` is for a sort row.
export function RailRow(props: { label: string; active: boolean; onClick: () => void; icon?: LucideIcon; trail?: ReactNode; disabled?: boolean; attrs?: Record<string, string> }) {
  const Icon = props.icon
  return (
    <button type="button" data-rail-row aria-pressed={props.active} disabled={props.disabled} onClick={props.onClick} {...props.attrs}>
      {Icon && <Glyph icon={Icon} size={14} aria-hidden="true" css-flex-shrink="0" />}
      <span data-rail-text>{props.label}</span>
      {props.trail}
    </button>
  )
}

export function RailDivider() {
  return <Box role="separator" css-margin="4px-0" css-border-top="1px-solid-border" />
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
                  <Box as="span" srOnly>
                    {props.dir === 'asc' ? ', ascending' : ', descending'}
                  </Box>
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
export function RailChips(props: {
  id: string
  icon: LucideIcon
  title: string
  noun: string
  items: RailChipItem[]
  picked: string | undefined
  onPick: (value: string | undefined) => void
}) {
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
        <button
          type="button"
          data-rail-icon
          aria-expanded={open}
          aria-label={open ? `Close ${props.noun} search` : `Search ${props.noun}s`}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Search size={13} aria-hidden="true" />
        </button>
      }
    >
      {open && (
        <Box css-position="relative" css-margin-bottom="8">
          <PlainInput
            autoFocus
            type="text"
            value={query}
            aria-label={`Search ${props.noun}s`}
            placeholder={`Search ${props.noun}s…`}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && close()}
            css-width="100%"
            css-box-sizing="border-box"
            css-font-size="13"
            css-padding="6px-28px-6px-12px"
            css-border-radius="6"
            css-background="bg"
            css-color="text"
            css-border="1px-solid-border"
          />
          <PlainButton
            type="button"
            data-rail-icon
            aria-label={`Close ${props.noun} search`}
            onClick={close}
            css-position="absolute"
            css-right="6"
            css-top="50%"
            css-transform="translateY-50%"
          >
            <X size={13} aria-hidden="true" />
          </PlainButton>
        </Box>
      )}
      <Box css-display="flex" css-flex-direction="column" css-align-items="flex-start" css-gap="6">
        {shown.map((item) => {
          const at = props.items.indexOf(item)
          const picked = props.picked === item.value
          return (
            <PlainButton
              key={item.value}
              type="button"
              data-rail-chip={item.value}
              aria-pressed={picked}
              aria-label={`${item.label}, ${item.count}`}
              onClick={() => props.onPick(picked ? undefined : item.value)}
              css-background={tint(at, picked)}
            >
              <Box as="span" css-font-size="12" css-font-variant-numeric="tabular-nums" css-flex-shrink="0" css-opacity={picked ? '0.9' : '0.6'}>
                {item.count}
              </Box>
              <Box as="span" css-min-width="0" css-overflow="hidden" css-text-overflow="ellipsis" css-white-space="nowrap">
                {item.label}
              </Box>
            </PlainButton>
          )
        })}
      </Box>
      {open && shown.length === 0 && (
        <Box css-font-size="12" css-color="muted">
          No {props.noun} matches “{query}”.
        </Box>
      )}
    </RailBlock>
  )
}

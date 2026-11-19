// The phone's navigation, from Kiro Crew's list-detail pattern and Issue
// Radar's phone top card: one card under the host's top bar names where you
// are, with the open-the-list icon at its right. It is a compact 28px button. Opening it
// takes the whole page for the list of sections, and picking one closes it
// again. A desktop has the left nav instead.
import type { ReactNode } from 'react'
import { PanelLeftOpen, X } from './icons.ts'
import { TOP_CARD } from './LeftNav.tsx'
import { NavAccordion, type NavGroup } from './NavAccordion.tsx'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

// The current page's name and the open-the-list icon, for the phone's header row.
export function RailButton(props: { groups: NavGroup[]; value: string; child?: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const current = props.groups.find((group) => group.key === props.value)
  const sub = current?.children?.find((item) => item.key === props.child)
  // With the menu open, the open section already names the page: the bar is
  // only its close button, at the right.
  if (props.open)
    return (
      <PlainButton
        type="button"
        data-top-rail-bar
        aria-expanded
        aria-controls="avoozl-top-rail-list"
        aria-label="Close the menu"
        onClick={() => props.onOpenChange(false)}
        css-margin-left="auto" css-display="inline-flex" css-align-items="center" css-justify-content="center" css-width="28" css-height="28" css-padding="0" css-border-radius="6" css-border="1px-solid-border" css-background="transparent" css-color="muted" css-cursor="pointer"
      >
        <X size={16} aria-hidden="true" />
      </PlainButton>
    )
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
      {/* One line: the page's label, then its sub-page, each cut short. */}
      <Box as="span" css-min-width="0" css-flex="1-1-auto" css-display="flex" css-align-items="center" css-gap="4" css-overflow="hidden" css-white-space="nowrap">
        <Box as="span" css-min-width="0" css-flex="0-1-auto" css-display="flex" css-overflow="hidden">{current?.label}</Box>
        {sub && <Box as="span" css-min-width="0" css-flex="0-1-auto" css-overflow="hidden" css-text-overflow="ellipsis" css-font-weight="400" css-color="muted">{` · ${sub.label}`}</Box>}
      </Box>
      <Box aria-hidden="true" as="span" css-display="inline-flex" css-flex-shrink="0" css-color="muted">
        <PanelLeftOpen size={16} />
      </Box>
    </button>
  )
}

// The full-page menu a phone's hamburger opens: the same accordion as the
// desktop's left nav, with the line controls and brand card at the bottom.
// `top` is the workspace pill, above the sections as on a desktop.
export function RailList(props: { groups: NavGroup[]; value: string; child?: string | null; onPick: (key: string, child?: string) => void; onOpenChange: (open: boolean) => void; footer?: ReactNode; top?: ReactNode }) {
  return (
    <Box id="avoozl-top-rail-list" data-top-rail-list data-top-row css-flex="1-1-0%" css-min-height="0" css-overflow-y="auto" css-display="flex" css-flex-direction="column" css-gap="8" css-padding="8px-8px-0">
      {props.top}
      <NavAccordion groups={props.groups} value={props.value} child={props.child} onPick={props.onPick} onDone={() => props.onOpenChange(false)} />
      {props.footer && (
        <Box data-top-rail-footer css-margin-top="auto" css-display="flex" css-flex-direction="column" css-gap="8" css-padding="12px-0">
          {props.footer}
        </Box>
      )}
    </Box>
  )
}

// The desktop's left nav, Issue Radar's sidebar model (NavAccordion): a card
// per section that opens like an accordion, then a small card of line
// controls, then the brand card. Drag its edge to make it wider or narrower; drag it well
// past its minimum, or press Collapse, and it becomes a thin tall bar whose
// entries read as vertical text. Width and collapse are remembered.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavSlotHost } from './nav-slot.tsx'
import { NavAccordion, type NavGroup } from './NavAccordion.tsx'
import { NAV_ROW } from './nav-style.ts'
import { NAV, NAV_COLLAPSE_AT, NAV_COLLAPSED_KEY, NAV_COLLAPSED_WIDTH, clampWidth, pageStorage, readFlag, readWidth, writeFlag, writeWidth } from './columns.ts'
import { ChevronRight } from './icons.ts'
import { ResizeHandle } from './ResizeHandle.tsx'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

// Issue Radar's sidebar cards, measured on the host: 12px corners, the
// elevated surface, a hairline border and a small shadow. The top card's
// border is the stronger one. Buttons in them keep Kiro Crew's compact size
// (28px at most) on every screen: there is no tall tap size.
export const NAV_CARD = { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-elevated)', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' } as const
export const TOP_CARD = { ...NAV_CARD, border: '1px solid var(--border-strong, var(--border))' } as const
export { NAV_ROW }
// The nav's small icon buttons (Stop the line, Refresh): 28px, icon only.
export const NAV_ICON = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' } as const
// The same icons on the page's top line: square, as tall as the row (the
// Plan a goal button beside them), never over 28px.
export const SQUARE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', aspectRatio: '1 / 1', minWidth: 24, maxHeight: 28, padding: 0, boxSizing: 'border-box', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' } as const
// The small section under the nav card that holds those icons, drawn only
// when there is something to put in it.
export function NavLine(props: { children: ReactNode }) {
  return (
    <Box data-nav-line css-border="1px-solid-border" css-border-radius="12" css-background="bg-elevated" css-box-shadow="0-1px-2px-rgba-0-0-0-0.05" css-display="flex" css-align-items="center" css-gap="6" css-padding="4">
      {props.children}
    </Box>
  )
}

// `top` is the workspace pill, first in the nav as Radar's repo switcher is.
export function LeftNav(props: { groups: NavGroup[]; value: string; child?: string | null; onPick: (key: string, child?: string) => void; line?: ReactNode; brand?: ReactNode; top?: ReactNode }) {
  const [width, setWidthState] = useState(() => readWidth(pageStorage(), NAV))
  const [collapsed, setCollapsedState] = useState(() => readFlag(pageStorage(), NAV_COLLAPSED_KEY))
  const root = useRef<HTMLElement>(null)
  // The thin bar has no room for a page's nav controls: they go in the page.
  const slots = useNavSlotHost()
  useEffect(() => {
    slots?.setInline(collapsed)
    return () => slots?.setInline(false)
  }, [collapsed, slots?.setInline]) // eslint-disable-line react-hooks/exhaustive-deps
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
  if (collapsed)
    return (
      <nav ref={root} aria-label="Avoozl pages" data-left-nav="collapsed" data-top-row style={{ flex: `0 0 ${NAV_COLLAPSED_WIDTH}px`, width: NAV_COLLAPSED_WIDTH, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '4px 2px', borderRight: '1px solid var(--border)', minHeight: 0, overflowY: 'auto' }}>
        <PlainButton type="button" aria-label="Expand the nav" data-nav-expand onClick={() => setCollapsed(false)} css-display="flex" css-justify-content="center" css-padding="6px-0" css-background="none" css-border="0" css-color="muted" css-cursor="pointer">
          <ChevronRight size={16} aria-hidden="true" />
        </PlainButton>
        <Box role="group" aria-label="Avoozl views" css-display="flex" css-flex-direction="column" css-gap="4">
          {props.groups.map((group) => {
            const selected = group.key === props.value
            return (
              <PlainButton key={group.key} type="button" data-nav-collapsed-item={group.key} aria-current={selected ? 'page' : undefined} aria-label={group.aria ?? group.text} onClick={() => props.onPick(group.key)} css-writing-mode="vertical-rl" css-transform="rotate-180deg" css-padding="10px-0" css-width="100%" css-background={selected ? 'accent-subtle-bg-hover-bg-elevated' : 'none'} css-border="0" css-border-radius="6" css-color={selected ? 'accent' : 'muted'} css-cursor="pointer" css-font-size="12.5" css-font-weight={selected ? '600' : '500'} css-white-space="nowrap">
                {group.text}
              </PlainButton>
            )
          })}
        </Box>
      </nav>
    )
  return (
    <>
      <nav ref={root} aria-label="Avoozl pages" data-left-nav="open" data-top-row style={{ flex: `0 0 ${width}px`, width, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 8px 4px 0', minHeight: 0, overflowY: 'auto' }}>
        {props.top}
        <NavAccordion groups={props.groups} value={props.value} child={props.child} onPick={props.onPick} />
        {props.line}
        <PlainButton type="button" aria-label="Collapse the nav" data-nav-collapse onClick={() => setCollapsed(true)} css-display="flex" css-align-items="center" css-gap="6" css-height="28" css-padding="0-10px" css-background="none" css-border="0" css-color="muted" css-cursor="pointer" css-font-size="12">
          <Box aria-hidden="true" as="span" css-display="inline-flex" css-transform="rotate-180deg">
            <ChevronRight size={14} />
          </Box>
          Collapse
        </PlainButton>
        {props.brand}
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

// A "More" button that opens a small panel of extra controls under it. On a
// phone the header and page headings keep one thin row by moving their extra
// buttons here. The panel stays mounted while open, so a control in it can
// open its own dialog; a tap outside, Esc, or a plain menu item closes it.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Ellipsis, type LucideIcon } from './icons.ts'
import { LAYER } from './layers.ts'
import { PlainButton } from './ui/Plain'
import { Glyph } from './ui/Glyph'
import { Box } from './ui/Box'

// `icon` replaces the ellipsis (a filter menu uses a filter icon); `on`
// marks the button as holding something set.
export function MoreMenu(props: { label: string; children: ReactNode; attrs?: Record<string, string>; icon?: LucideIcon; on?: boolean }) {
  const Icon = props.icon ?? Ellipsis
  const [open, setOpen] = useState(false)
  // The panel opens leftward from the button, or rightward when the button
  // sits too near the left edge for it to fit.
  const [fromLeft, setFromLeft] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      // A dialog opened from the menu is portaled to the top layer; a tap in
      // it is not outside the menu, or the dialog would close with it.
      if ((target as Element).closest?.('dialog[open]')) return
      if (root.current && !root.current.contains(target)) setOpen(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div ref={root} style={{ position: 'relative', flexShrink: 0 }} {...props.attrs}>
      <PlainButton
        type="button"
        aria-label={props.label}
        aria-expanded={open}
        aria-haspopup="true"
        data-more-button
        onClick={(event) => {
          setFromLeft(event.currentTarget.getBoundingClientRect().right < 240)
          setOpen(!open)
        }}
        css-display="inline-flex" css-align-items="center" css-justify-content="center" css-width={props.icon ? '24' : '28'} css-height={props.icon ? '24' : '28'} css-border-radius="6" css-border="1px-solid-border" css-background={open ? 'bg-hover-bg-elevated' : 'transparent'} css-color="text" css-cursor="pointer"
      >
        <Glyph icon={Icon} size={props.icon ? 14 : 18} aria-hidden="true" css-color={props.on ? 'accent' : undefined} />
      </PlainButton>
      {open && (
        <Box
          data-more-panel
          // A click on a plain item (one that opens nothing) closes the menu.
          onClick={(event) => {
            // A dialog a control opened is portaled out of the panel; React
            // still bubbles its clicks here, and they must not close it.
            if (!event.currentTarget.contains(event.target as Node)) return
            const item = (event.target as Element).closest('button, a')
            if (item && !item.hasAttribute('aria-haspopup') && !item.closest('[data-keep-menu]')) setOpen(false)
          }}
          css-position="absolute" css-top="100%" css-left={fromLeft ? '0' : undefined} css-right={fromLeft ? undefined : '0'} css-z-index={LAYER.popover} css-margin-top="4" css-min-width="220" css-max-width="calc-100vw-24px" css-display="flex" css-flex-direction="column" css-align-items="stretch" css-gap="8" css-padding="10" css-border-radius="10" css-border="1px-solid-border" css-background="card-bg-elevated" css-box-shadow="0-8px-24px-rgba-0-0-0-0.18"
        >
          {props.children}
        </Box>
      )}
    </div>
  )
}

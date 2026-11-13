// The page's one tooltip. The host SDK ships none and the host uses the
// native title attribute, which is slow, unstyled and unreachable by
// keyboard. This one renders in a fixed layer on document.body, so no
// drawer or scroll area clips it, and it never moves the layout. Inside a
// modal it renders into that modal instead: the modal is on the browser's
// top layer, so only its own tooltips show above it.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeTooltip, tooltipController } from './tooltip.ts'
import { LAYER } from './layers.ts'
import { usePortalTarget } from './Modal.tsx'

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

const keyboardFocus = (target: EventTarget) => {
  try {
    return (target as Element).matches(':focus-visible')
  } catch {
    return true
  }
}

// Wraps its anchor in an inline span that carries the hover and focus
// handlers (a disabled button gets no pointer events, the span does). A
// function child gets the id for its control's aria-describedby; pass it
// only when the text adds to the control's name.
export function Tooltip(props: {
  text: string | null | undefined
  children: ReactNode | ((describedBy: string | undefined) => ReactNode)
  // 'block' for an anchor that fills its row (a full-width button).
  display?: 'inline-flex' | 'block'
}) {
  const id = useId()
  const portal = usePortalTarget()
  const anchor = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<ReturnType<typeof placeTooltip> | null>(null)
  const control = useMemo(() => tooltipController({ onChange: setOpen }), [])
  useEffect(() => control.hide, [control])
  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => control.key(event.key)
    const away = () => control.hide()
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', away)
    return () => {
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', away)
    }
  }, [open, control])
  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return setPlace(null)
    const a = anchor.current.getBoundingClientRect()
    const t = tip.current.getBoundingClientRect()
    setPlace(placeTooltip(a, t, { width: window.innerWidth, height: window.innerHeight }))
  }, [open, props.text])
  const text = props.text?.trim()
  const child = typeof props.children === 'function' ? props.children(text ? id : undefined) : props.children
  if (!text) return <>{child}</>
  return (
    <span
      ref={anchor}
      style={{ display: props.display ?? 'inline-flex', minWidth: 0 }}
      onPointerEnter={(event) => control.enter(event.pointerType)}
      onPointerLeave={control.leave}
      onPointerDown={control.hide}
      onFocus={(event) => control.focus(keyboardFocus(event.target))}
      onBlur={control.blur}
      data-tooltip-anchor
    >
      {child}
      <span id={id} role="tooltip" hidden>
        {text}
      </span>
      {open &&
        createPortal(
          <div
            ref={tip}
            aria-hidden="true"
            data-tooltip
            data-side={place?.side}
            style={{
              position: 'fixed',
              top: place?.top ?? 0,
              left: place?.left ?? 0,
              visibility: place ? 'visible' : 'hidden',
              zIndex: LAYER.tooltip,
              maxWidth: 'min(20rem, calc(100vw - 12px))',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.4,
              pointerEvents: 'none',
              background: 'var(--bg-elevated, var(--card))',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              boxShadow: '0 4px 12px rgb(0 0 0 / 0.25)',
              animation: reducedMotion() ? undefined : 'avoozl-tip-in 120ms ease-out',
            }}
          >
            <style>{'@keyframes avoozl-tip-in{from{opacity:0}to{opacity:1}}'}</style>
            {text}
            {place && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: place.arrow - 4,
                  [place.side === 'top' ? 'bottom' : 'top']: -5,
                  width: 8,
                  height: 8,
                  transform: 'rotate(45deg)',
                  background: 'var(--bg-elevated, var(--card))',
                  borderRight: place.side === 'top' ? '1px solid var(--border)' : undefined,
                  borderBottom: place.side === 'top' ? '1px solid var(--border)' : undefined,
                  borderLeft: place.side === 'bottom' ? '1px solid var(--border)' : undefined,
                  borderTop: place.side === 'bottom' ? '1px solid var(--border)' : undefined,
                }}
              />
            )}
          </div>,
          portal ?? document.body,
        )}
    </span>
  )
}

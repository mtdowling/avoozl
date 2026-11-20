// Drag to pan a scroll box with the mouse (the Graph's Focus tree). A left
// drag pans from empty space; a middle drag pans from anywhere, cards too,
// and stops the browser's autoscroll and middle-click link opening. A press
// that moves past DRAG_SLOP is a drag, never a click. Touch is left to the
// browser's own scrolling, and there is no inertia (reduced motion holds).
import { useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'

export const DRAG_SLOP = 4
// What a left press on stays a press, not the start of a pan.
export const CONTROL = 'a, button, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="link"], [contenteditable]'

// Which press starts a pan.
export function panPress(event: { pointerType: string; button: number }, onControl: boolean): boolean {
  if (event.pointerType === 'touch') return false
  if (event.button === 1) return true
  return event.button === 0 && !onControl
}

export function useScrollPan(box: RefObject<HTMLElement | null>) {
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  // The last press became a drag: its click or auxclick is swallowed.
  const moved = useRef(false)
  const [panning, setPanning] = useState(false)
  const end = () => {
    drag.current = null
    setPanning(false)
    // The click a drag ends with comes in this same task; a later one counts.
    if (moved.current) setTimeout(() => (moved.current = false), 0)
  }
  const swallow = (event: MouseEvent) => {
    if (!moved.current) return
    moved.current = false
    event.preventDefault()
    event.stopPropagation()
  }
  return {
    panning,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        moved.current = false
        const element = box.current
        if (!element || drag.current) return
        const target = event.target instanceof Element ? event.target.closest(CONTROL) : null
        if (!panPress(event, Boolean(target && element.contains(target)))) return
        // No autoscroll, no text selection; moves that leave the box still pan.
        event.preventDefault()
        element.setPointerCapture?.(event.pointerId)
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false }
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const start = drag.current
        const element = box.current
        if (!start || !element || start.id !== event.pointerId) return
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y
        if (!start.moved) {
          if (Math.hypot(dx, dy) < DRAG_SLOP) return
          start.moved = moved.current = true
          setPanning(true)
        }
        element.scrollLeft = start.left - dx
        element.scrollTop = start.top - dy
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
      // Some browsers start autoscroll on the mouse event, not the pointer one.
      onMouseDown(event: MouseEvent) {
        if (event.button === 1) event.preventDefault()
      },
      onClickCapture: swallow,
      onAuxClickCapture: swallow,
    },
  }
}

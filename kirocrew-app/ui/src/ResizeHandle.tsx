// A column's right edge (or, with edge="left", its left edge): drag it, or
// focus it and press Left or Right, to change the width; double-click puts
// the default back. Desktop only.
import { useCallback, useState } from 'react'
import { stepWidth } from './columns.ts'
import { LAYER } from './layers.ts'

export function ResizeHandle(props: {
  label: string
  width: number
  min: number
  max: number
  // Where the column starts, so a drag can turn the pointer into a width.
  left?: () => number
  // A right-hand column's handle, on its left edge: dragging left widens.
  edge?: 'left' | 'right'
  onResize: (width: number) => void
  onReset: () => void
  attrs?: Record<string, string>
}) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const lit = hover || focus
  const { left, onResize, width } = props
  const edge = props.edge ?? 'right'
  const down = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const target = event.currentTarget
      target.setPointerCapture?.(event.pointerId)
      const start = left?.() ?? 0
      // A left edge moves by the pointer's travel from where it went down.
      const end = event.clientX + width
      const move = (e: PointerEvent) => onResize(edge === 'left' ? end - e.clientX : e.clientX - start)
      const up = () => {
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
    },
    [left, edge, width, onResize],
  )
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      aria-valuenow={props.width}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      tabIndex={0}
      data-resize-handle
      {...props.attrs}
      onPointerDown={down}
      onDoubleClick={props.onReset}
      onKeyDown={(event) => {
        const next = stepWidth(props.width, event.key, edge)
        if (next === null) return
        event.preventDefault()
        props.onResize(next)
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{ flex: '0 0 8px', alignSelf: 'stretch', cursor: 'col-resize', position: 'relative', zIndex: LAYER.raised, display: 'flex', justifyContent: 'center', outline: 'none' }}
    >
      <span aria-hidden="true" style={{ width: 2, height: '100%', background: lit ? 'var(--accent)' : 'transparent', transition: 'background 120ms' }} />
    </div>
  )
}

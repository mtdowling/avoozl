// A column's right edge: drag it, or focus it and press Left or Right, to
// change the width; double-click puts the default back. Desktop only.
// `growsLeft` is for a column at the right of its row, dragged by its left
// edge: `left()` is then the column's right edge, and moving left widens it.
import { useCallback, useState } from 'react'
import { stepWidth } from './columns.ts'
import { LAYER } from './layers.ts'

export function ResizeHandle(props: {
  label: string
  width: number
  min: number
  max: number
  // Where the column starts, so a drag can turn the pointer into a width.
  left: () => number
  growsLeft?: boolean
  onResize: (width: number) => void
  onReset: () => void
}) {
  const [hover, setHover] = useState(false)
  const { left, onResize, growsLeft } = props
  const down = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const target = event.currentTarget
      target.setPointerCapture?.(event.pointerId)
      const start = left()
      // A left-edge handle sits a few pixels off the column: keep the width
      // where it is until the pointer moves, so a grab does not jump.
      const grab = growsLeft ? start - event.clientX - props.width : 0
      const move = (e: PointerEvent) => onResize(growsLeft ? start - e.clientX - grab : e.clientX - start)
      const up = () => {
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
    },
    [left, onResize, growsLeft, props.width],
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
      onPointerDown={down}
      onDoubleClick={props.onReset}
      onKeyDown={(event) => {
        const next = stepWidth(props.width, growsLeft ? (event.key === 'ArrowLeft' ? 'ArrowRight' : event.key === 'ArrowRight' ? 'ArrowLeft' : event.key) : event.key)
        if (next === null) return
        event.preventDefault()
        props.onResize(next)
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ flex: '0 0 8px', alignSelf: 'stretch', cursor: 'col-resize', position: 'relative', zIndex: LAYER.raised, display: 'flex', justifyContent: 'center', outline: 'none' }}
    >
      <span aria-hidden="true" style={{ width: 2, height: '100%', background: hover ? 'var(--accent)' : 'transparent', transition: 'background 120ms' }} />
    </div>
  )
}

// The spec's details (Epic, Category, Repositories, Phases, Progress,
// Dates, Open decisions...) in a panel at the bottom of the specs list
// column, like an IDE's bottom panel. On a desktop its top bar is a
// divider: drag it, or focus it and press Up or Down, to change the height;
// double-click puts the default back. The chevron hides the panel so the
// list takes the full height. Height and hidden are kept in this browser.
// A phone shows the list or the spec, not both, so the panel stacks under
// the spec there, with the same chevron and no divider.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { SPEC_PANEL, SPEC_PANEL_HIDDEN_KEY, clampWidth, pageStorage, panelMax, readFlag, readWidth, stepHeight, writeFlag, writeWidth } from './columns.ts'
import { ChevronDown } from './icons.ts'
import { LAYER } from './layers.ts'
import { Tooltip } from './Tooltip.tsx'

// Desktop: the sections sit in a grid that fits the width, with no
// dividers between them; the fields inside are unchanged.
const PANEL_CSS = `[data-spec-panel-body] [data-spec-rail]{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));column-gap:20px;row-gap:16px;align-items:start}
[data-spec-panel-body] [data-rail-section]{border-bottom:0!important;margin-bottom:0!important;padding-bottom:0!important;min-width:0}
[data-spec-panel-toggle]{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:none;color:var(--muted);cursor:pointer}
[data-spec-panel-toggle]:hover{background:var(--bg-hover);color:var(--text)}
[data-spec-panel-divider][data-resizable]:hover{box-shadow:inset 0 2px 0 var(--accent)}
[data-spec-panel-toggle]:focus-visible,[data-spec-panel-divider]:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}`

export const PANEL_ID = 'avoozl-spec-details'

export function SpecDetailsPanel(props: {
  // A phone: stacked under the spec, no divider.
  phone: boolean
  // What sits above the panel: on a desktop the specs list, which shrinks
  // to fit; on a phone the spec.
  content: ReactNode
  // The details; with none (no spec open, or a review) only the content
  // shows, in the same tree so the list is not remounted.
  children?: ReactNode
}) {
  const [hidden, setHidden] = useState(() => readFlag(pageStorage(), SPEC_PANEL_HIDDEN_KEY))
  const [stored, setStored] = useState(() => readWidth(pageStorage(), SPEC_PANEL))
  const shown = props.children != null && props.children !== false
  // The height the content and the panel body share, as laid out.
  const [room, setRoom] = useState<number | null>(null)
  const stop = useRef<(() => void) | null>(null)
  const ref = useCallback(
    (node: HTMLElement | null) => {
      stop.current?.()
      stop.current = null
      if (!node || props.phone || typeof ResizeObserver === 'undefined') return setRoom(null)
      // The bar's own height is not the content's.
      const measure = () => setRoom(node.clientHeight - ((node.querySelector('[data-spec-panel-divider]') as HTMLElement | null)?.offsetHeight ?? 0))
      measure()
      const observer = new ResizeObserver(measure)
      observer.observe(node)
      stop.current = () => observer.disconnect()
    },
    [props.phone],
  )
  useEffect(() => () => stop.current?.(), [])
  const max = room === null ? SPEC_PANEL.max : panelMax(room)
  const height = Math.min(stored, max)
  const resize = useCallback(
    (next: number) => {
      const value = Math.min(clampWidth(SPEC_PANEL, next), max)
      setStored(value)
      writeWidth(pageStorage(), SPEC_PANEL, value)
    },
    [max],
  )
  const toggle = () => {
    setHidden(!hidden)
    writeFlag(pageStorage(), SPEC_PANEL_HIDDEN_KEY, !hidden)
  }
  const down = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    // The panel's top follows the pointer: up makes it taller.
    const start = event.clientY + height
    const move = (e: PointerEvent) => resize(start - e.clientY)
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }
  const label = hidden ? 'Show the spec details' : 'Hide the spec details'
  const toggleButton = (
    <Tooltip text={label}>
      <button type="button" data-spec-panel-toggle aria-label={label} aria-expanded={!hidden} aria-controls={PANEL_ID} onClick={toggle}>
        <ChevronDown size={14} aria-hidden="true" style={{ transform: hidden ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }} />
      </button>
    </Tooltip>
  )
  const title = (
    <h3 style={{ margin: 0, flex: '1 1 auto', fontSize: 11, fontWeight: 500, lineHeight: '17px', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>Spec details</h3>
  )
  const bar = { display: 'flex', alignItems: 'center', gap: 6, minHeight: 30, boxSizing: 'border-box', padding: '0 8px 0 12px', borderTop: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)' } as const
  if (props.phone)
    return (
      <>
        {props.content}
        <section data-spec-panel="stacked" data-hidden={hidden ? '' : undefined} aria-label="Spec details panel">
          <style>{PANEL_CSS}</style>
          <div data-spec-panel-bar style={{ ...bar, padding: '0 4px 0 0', background: 'none' }}>
            {title}
            {toggleButton}
          </div>
          <aside id={PANEL_ID} aria-label="Spec details" hidden={hidden} style={{ paddingTop: 12, display: hidden ? 'none' : undefined }}>
            {props.children}
          </aside>
        </section>
      </>
    )
  return (
    <div ref={ref} data-spec-split style={shown ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } : undefined}>
      <div data-spec-scroll style={shown ? { flex: '1 1 0%', minHeight: 0, overflowY: 'auto' } : undefined}>
        {props.content}
      </div>
      {shown && (
      <section data-spec-panel="docked" data-hidden={hidden ? '' : undefined} aria-label="Spec details panel" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <style>{PANEL_CSS}</style>
        <div
          data-spec-panel-divider
          data-resizable={hidden ? undefined : ''}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the spec details"
          aria-valuenow={height}
          aria-valuemin={SPEC_PANEL.min}
          aria-valuemax={max}
          aria-controls={PANEL_ID}
          tabIndex={hidden ? -1 : 0}
          onPointerDown={hidden ? undefined : down}
          onDoubleClick={hidden ? undefined : (event) => !(event.target as HTMLElement).closest('button') && resize(SPEC_PANEL.initial)}
          onKeyDown={(event) => {
            if (hidden || event.target !== event.currentTarget) return
            const next = stepHeight(height, event.key)
            if (next === null) return
            event.preventDefault()
            resize(next)
          }}
          style={{ ...bar, position: 'relative', zIndex: LAYER.raised, cursor: hidden ? 'default' : 'row-resize', userSelect: 'none', touchAction: 'none' }}
        >
          {title}
          {toggleButton}
        </div>
        <aside
          id={PANEL_ID}
          aria-label="Spec details"
          data-spec-panel-body
          hidden={hidden}
          style={{ display: hidden ? 'none' : undefined, height, boxSizing: 'border-box', overflowY: 'auto', overscrollBehavior: 'contain', padding: '14px 12px 16px', fontSize: 12.5 }}
        >
          {props.children}
        </aside>
      </section>
      )}
    </div>
  )
}

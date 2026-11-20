// One number with its label and a line under it, as a button: Home's status
// tiles. Kiro Crew's `StatCard` has only a label and a value (the label above
// the value), so the page keeps its own tile (UC1.3) drawn from the theme's
// variables. `warm` colors the number with the theme's orange. `describedBy`
// is not needed: the tile's accessible name is its `name`. Render
// `StatTileStyle` once on a page that shows tiles. Other props (`data-*`)
// go on the button.
import type { ButtonHTMLAttributes } from 'react'

export type StatTileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'children' | 'type' | 'aria-label' | 'value'> & {
  value: number | string | null
  label: string
  sub?: string
  warm?: boolean
  name: string
}

const CSS = `[data-stat-tile]{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;height:100%;padding:14px 16px;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--text);text-align:left;cursor:pointer;transition:border-color 120ms ease,background-color 120ms ease}
[data-stat-tile]:hover{border-color:var(--border-strong,var(--muted));background:var(--bg-hover,var(--card))}
[data-stat-tile]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
[data-stat-tile-value]{font-size:28px;line-height:1.15;font-weight:600;font-variant-numeric:tabular-nums;color:var(--text-strong,var(--text))}
[data-stat-tile][data-warm] [data-stat-tile-value]{color:var(--tile-orange,var(--warning))}
[data-stat-tile-label]{font-size:13px;font-weight:500}
[data-stat-tile-sub]{font-size:11px;color:var(--muted)}
@media (max-width:767px){[data-stat-tile]{padding:10px 12px}[data-stat-tile-value]{font-size:24px}}
@media (prefers-reduced-motion:reduce){[data-stat-tile]{transition:none}}`

export function StatTileStyle() {
  return <style>{CSS}</style>
}

export function StatTile({ value, label, sub, warm, name, ...rest }: StatTileProps) {
  return (
    <button type="button" aria-label={name} data-stat-tile data-warm={warm || undefined} {...rest}>
      <span data-stat-tile-value>{value ?? '–'}</span>
      <span data-stat-tile-label>{label}</span>
      <span data-stat-tile-sub>{sub}</span>
    </button>
  )
}

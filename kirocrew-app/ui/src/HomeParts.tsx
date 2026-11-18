// Home's building blocks: the number tiles, a section with a small-caps
// header and a grey hint on the right, a half-and-half row, a boxed list,
// and the one-line empty state. Styled with the host's theme variables
// only. Phones stack every row to one column; nothing moves under
// prefers-reduced-motion.
import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import type { Tile } from './home-api.ts'
import { linkHref } from './views-api.ts'

export const HOME_CSS = `
[data-home]{display:flex;flex-direction:column;gap:20px;min-width:0}
[data-home-tiles]{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
[data-home-tiles]>li>span{height:100%}
[data-home-tile]{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;height:100%;padding:14px 16px;border:1px solid var(--border);border-radius:10px;background:var(--card);color:var(--text);text-align:left;cursor:pointer;transition:border-color 120ms ease,background-color 120ms ease}
[data-home-tile]:hover{border-color:var(--border-strong,var(--muted));background:var(--bg-hover,var(--card))}
[data-home-tile]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
[data-home-tile-value]{font-size:28px;line-height:1.15;font-weight:600;font-variant-numeric:tabular-nums;color:var(--text-strong,var(--text))}
[data-home-tile][data-warm] [data-home-tile-value]{color:var(--tile-orange,var(--warning))}
[data-home-tile-label]{font-size:13px;font-weight:500}
[data-home-tile-sub]{font-size:11px;color:var(--muted)}
[data-home-section]{display:flex;flex-direction:column;min-width:0}
[data-home-head]{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 8px;min-width:0}
[data-home-head] h3{margin:0;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-strong,var(--muted))}
[data-home-hint]{font-size:11px;color:var(--muted);text-align:right;overflow-wrap:anywhere}
[data-home-hint] button{text-decoration:underline;color:inherit}
[data-home-pair]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:stretch}
[data-home-box]{flex:1;min-height:0;border:1px solid var(--border);border-radius:10px;background:var(--card);padding:2px 14px;overflow-y:auto}
[data-home-pair] [data-home-box]{max-height:22rem}
[data-home-list]{margin:0;padding:0;list-style:none}
[data-home-row]{display:flex;gap:10px;align-items:baseline;padding:9px 0;border-top:1px solid var(--border);font-size:13px;min-width:0}
[data-home-row]:first-child{border-top:0}
[data-home-row-main]{flex:1;min-width:0;overflow-wrap:anywhere}
[data-home-row-side]{flex:none;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
[data-home-sub]{display:block;font-size:12px;color:var(--muted)}
[data-home-num]{flex:none;min-width:1.5em;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
[data-home-pr]{flex:none;font-size:12px;font-variant-numeric:tabular-nums;text-decoration:underline}
[data-home-empty]{margin:0;padding:10px 0;font-size:13px;color:var(--muted)}
[data-home-needs]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
[data-home-need]{display:flex;flex-direction:column;gap:6px;height:100%;padding:12px 14px;border:1px solid var(--border);border-left:3px solid var(--tile-orange,var(--warning));border-radius:10px;background:var(--card);min-width:0;overflow-wrap:anywhere}
[data-home-need-detail]{font-size:12px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
[data-home-need-foot]{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:4px}
@media (max-width:1180px){[data-home-tiles]{grid-template-columns:repeat(3,minmax(0,1fr))}[data-home-needs]{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:767px){[data-home]{gap:16px}[data-home-tiles]{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}[data-home-tile]{padding:10px 12px}[data-home-tile-value]{font-size:24px}[data-home-needs],[data-home-pair]{grid-template-columns:minmax(0,1fr)}[data-home-pair] [data-home-box]{max-height:none}}
@media (prefers-reduced-motion:reduce){[data-home-tile]{transition:none}}
`

export function HomeStyle() {
  return <style>{HOME_CSS}</style>
}

export function Tiles({ tiles, onOpen }: { tiles: Tile[]; onOpen: (tile: Tile) => void }) {
  return (
    <ul data-home-tiles aria-label="Status">
      {tiles.map((tile) => (
        <li key={tile.key}>
          <Tooltip text={tile.tip} display="block">
            {() => (
              <button
                type="button"
                data-home-tile={tile.key}
                data-warm={tile.warm || undefined}
                aria-label={`${tile.label}: ${tile.value ?? 'not read yet'}. ${tile.tip}`}
                onClick={() => onOpen(tile)}
              >
                <span data-home-tile-value>{tile.value ?? '–'}</span>
                <span data-home-tile-label>{tile.label}</span>
                <span data-home-tile-sub>{tile.sub}</span>
              </button>
            )}
          </Tooltip>
        </li>
      ))}
    </ul>
  )
}

export function HomeSection({ id, title, hint, children }: { id: string; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section data-home-section={id} aria-labelledby={`home-${id}`}>
      <div data-home-head>
        <h3 id={`home-${id}`}>{title}</h3>
        {hint && <span data-home-hint>{hint}</span>}
      </div>
      {children}
    </section>
  )
}

export function HomePair({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div data-home-pair={id}>
      {children}
    </div>
  )
}

export function HomeBox({ children }: { children: ReactNode }) {
  return <div data-home-box>{children}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p data-home-empty>{children}</p>
}

// A #N link to GitHub, in a new tab.
export function PrLink({ number, url, label }: { number: number; url: string | null; label: string }) {
  if (!linkHref(url)) return null
  return (
    <a data-home-pr href={linkHref(url)} target="_blank" rel="noopener noreferrer" aria-label={label}>
      #{number}
    </a>
  )
}

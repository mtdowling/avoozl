// Home's building blocks: the number tiles, a section with a small-caps
// header and a grey hint on the right, a half-and-half row, a boxed list,
// and the one-line empty state. Styled with the host's theme variables
// only. Phones stack every row to one column; nothing moves under
// prefers-reduced-motion.
import type { ReactNode } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import type { Tile } from './home-api.ts'
import { linkHref } from './views-api.ts'
import { StatTile, StatTileStyle } from './ui/StatTile'
import { HomeCss } from './ui/PageStyles'


export function HomeStyle() {
  return (
    <>
      <HomeCss />
      <StatTileStyle />
    </>
  )
}

export function Tiles({ tiles, onOpen }: { tiles: Tile[]; onOpen: (tile: Tile) => void }) {
  return (
    <ul data-home-tiles aria-label="Status">
      {tiles.map((tile) => (
        <li key={tile.key}>
          <Tooltip text={tile.tip} display="block">
            {() => (
              <StatTile
                data-home-tile={tile.key}
                warm={tile.warm}
                name={`${tile.label}: ${tile.value ?? 'not read yet'}. ${tile.tip}`}
                value={tile.value}
                label={tile.label}
                sub={tile.sub}
                onClick={() => onOpen(tile)}
              />
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

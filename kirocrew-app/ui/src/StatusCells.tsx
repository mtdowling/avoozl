// Two compact status cells in one row (Home and Settings): a dot and a short
// title on one line ("Driver: not started"), its actions beside it or one line
// under it. The long explanation is the title's tooltip (the shared tooltip, so
// a tap shows it on a phone). The cells sit side by side and stack only when the
// row is narrower than 300px. Sizes follow Kiro Crew's own panels: 12px text,
// 11px small buttons with a 6px radius, theme colors only.
import type { ReactNode } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { linkHref } from './views-api.ts'
import { StatusCellsStyle } from './ui/PageStyles'

export type CellTone = 'ok' | 'warn' | 'danger' | 'muted'


export function StatusRow(props: { children: ReactNode }) {
  return (
    <div data-sc-row>
      <StatusCellsStyle />
      <div data-sc-grid>{props.children}</div>
    </div>
  )
}

// `tip` is the whole explanation; it is also on the cell as data-tip so a test
// (or a screen reader's description) can read it without hovering.
export function StatusCell(props: { tone: CellTone; title: string; tip: string; actions?: ReactNode; [attr: `data-${string}`]: unknown }) {
  const { tone, title, tip, actions, ...rest } = props
  return (
    <div data-sc data-tip={tip} {...rest}>
      <Tooltip text={tip}>
        {(describedBy) => (
          <span data-sc-title tabIndex={0} aria-describedby={describedBy}>
            <i data-sc-dot data-tone={tone} aria-hidden="true" />
            {title}
          </span>
        )}
      </Tooltip>
      {actions && <span data-sc-actions>{actions}</span>}
    </div>
  )
}

// A small icon button (or link when it has `href`). The label is its accessible
// name and its tooltip; `tip` replaces the tooltip text when it says more.
export function CellAct(props: { label: string; icon: ReactNode; onClick?: () => void; href?: string; primary?: boolean; tip?: string; [attr: `data-${string}`]: unknown }) {
  const { label, icon, onClick, href, primary, tip, ...rest } = props
  return (
    <Tooltip text={tip ?? label}>
      {href ? (
        <a data-sc-act data-primary={primary ? '' : undefined} aria-label={label} href={linkHref(href)} {...rest}>
          {icon}
        </a>
      ) : (
        <button type="button" data-sc-act data-primary={primary ? '' : undefined} aria-label={label} onClick={onClick} {...rest}>
          {icon}
        </button>
      )}
    </Tooltip>
  )
}

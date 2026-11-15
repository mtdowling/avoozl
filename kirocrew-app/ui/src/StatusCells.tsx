// Two compact status cells in one row (Home and Settings): a dot and a short
// title on one line ("Driver: not started"), its actions beside it or one line
// under it. The long explanation is the title's tooltip (the shared tooltip, so
// a tap shows it on a phone). The cells sit side by side and stack only when the
// row is narrower than 300px. Sizes follow Kiro Crew's own panels: 12px text,
// 11px small buttons with a 6px radius, theme colors only.
import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { linkHref } from './views-api.ts'

export type CellTone = 'ok' | 'warn' | 'danger' | 'muted'

const CSS = `
[data-sc-row]{container-type:inline-size}
[data-sc-grid]{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px}
@container (max-width:420px){[data-sc-grid]{grid-template-columns:minmax(0,1fr)}}
[data-sc]{display:flex;flex-wrap:nowrap;align-items:center;align-content:flex-start;gap:0 8px;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;line-height:18px;color:var(--text)}
[data-sc-title]{flex:0 1 auto;display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;font-weight:600;color:var(--text-strong,var(--text));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-sc-dot]{flex:none;width:8px;height:8px;border-radius:50%;background:var(--muted)}
[data-sc-dot][data-tone=ok]{background:var(--ok)}
[data-sc-dot][data-tone=warn]{background:var(--warning,#b7791f)}
[data-sc-dot][data-tone=danger]{background:var(--danger)}
[data-sc-actions]{flex:none;display:inline-flex;flex-wrap:nowrap;align-items:center;gap:4px;margin-left:auto}
[data-sc-act]{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;padding:0;background:transparent;border:1px solid transparent;border-radius:6px;color:var(--muted);font:inherit;text-decoration:none;cursor:pointer;transition:background-color .12s,color .12s}
[data-sc-act]:hover{background:var(--bg-hover);color:var(--text)}
[data-sc-act][data-primary]{color:var(--accent)}
[data-sc-act]:disabled{opacity:.6;cursor:default}
@media (pointer:coarse),(max-width:640px){[data-sc-act]{width:26px;height:26px}[data-sc-actions]{gap:2px}}
`

export function StatusRow(props: { children: ReactNode }) {
  return (
    <div data-sc-row>
      <style>{CSS}</style>
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

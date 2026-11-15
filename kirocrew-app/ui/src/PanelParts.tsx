// The parts every side-panel view is built from: a toolbar, a folding section,
// a dense row, a status chip and an empty state. A new section is a few lines:
//
//   <PanelSection id="x" title="X" count={rows.length} summary="2 held">
//     {rows.length ? rows.map((r) => <PanelRow key={r.id} icon={Inbox} title={r.title} age="3 min" />) : <PanelEmpty>Nothing here.</PanelEmpty>}
//   </PanelSection>
//
// Sizes follow Kiro Crew's own panels: 13px titles, 11px meta, a 28px section
// header and 11px chips. On a phone (a narrow screen) buttons
// keep their compact size and rows stay two lines, nothing scrolls sideways and
// nothing is sticky. Colors are the theme's, so light, dark and custom themes
// work. Kept free of data reads: callers pass what to show.
import type { ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from './icons.ts'
import { Tooltip } from './Tooltip.tsx'
import { linkHref } from './views-api.ts'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted'

// Every size and the phone rules live here once, keyed by data attributes.
export const PANEL_CSS = `
[data-pp]{font-size:12px;line-height:1.35;min-width:0;max-width:100%;overflow-x:hidden;box-sizing:border-box}
[data-pp] *{box-sizing:border-box}
[data-pp-toolbar]{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;padding:6px 8px;border-bottom:1px solid var(--border)}
[data-pp-toolbar-end]{margin-left:auto;display:inline-flex;align-items:center;gap:6px}
[data-pp-strip]{display:flex;flex-wrap:wrap;gap:4px 6px;padding:6px 8px;border-bottom:1px solid var(--border)}
[data-pp-section]{border-bottom:1px solid var(--border)}
[data-pp-section]>summary{display:flex;align-items:center;gap:6px;min-height:28px;padding:0 8px;cursor:pointer;list-style:none;font-size:12px;font-weight:600;user-select:none}
[data-pp-section]>summary::-webkit-details-marker{display:none}
[data-pp-section]>summary [data-pp-chevron]{transition:transform .12s;flex:none;color:var(--muted)}
[data-pp-section][open]>summary [data-pp-chevron]{transform:rotate(90deg)}
[data-pp-summary]{margin-left:auto;font-size:11px;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
[data-pp-list]{list-style:none;margin:0;padding:0}
[data-pp-row]{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;column-gap:6px;padding:3px 8px;min-height:36px;border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent)}
[data-pp-row-icon]{display:inline-flex;color:var(--muted)}
[data-pp-row-main]{display:flex;flex-direction:column;min-width:0}
[data-pp-row-line]{display:flex;align-items:center;gap:6px;min-width:0}
[data-pp-row-title]{display:block;font-size:13px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
a[data-pp-row-title]{text-decoration:none}
a[data-pp-row-title]:hover{text-decoration:underline}
[data-pp-row-line]>[data-tooltip-anchor]{flex:none}
[data-pp-row-line]>[data-tooltip-anchor]:first-child{flex:1 1 auto;min-width:0}
[data-pp-age]{flex:none;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
[data-pp-row-meta]{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
[data-pp-actions]{display:inline-flex;align-items:center;gap:4px;flex:none}
[data-pp-chip]{display:inline-flex;align-items:center;gap:3px;flex:none;max-width:10rem;padding:0 6px;border-radius:4px;font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);background:color-mix(in srgb,var(--text) 8%,transparent)}
[data-pp-chip][data-tone=ok]{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}
[data-pp-chip][data-tone=warn]{color:var(--warning,#b7791f);background:color-mix(in srgb,var(--warning,#b7791f) 16%,transparent)}
[data-pp-chip][data-tone=danger]{color:var(--danger);background:color-mix(in srgb,var(--danger) 14%,transparent)}
[data-pp-chip][data-tone=info]{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
[data-pp-act]{background:transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:24px;padding:0 8px;border:1px solid var(--border);border-radius:6px;color:var(--text);font:inherit;font-size:12px;text-decoration:none;white-space:nowrap;cursor:pointer}
[data-pp-act]:hover{background:color-mix(in srgb,var(--text) 8%,transparent)}
[data-pp-act][data-pp-primary]{border-color:var(--accent);color:var(--accent)}
[data-pp-act]:disabled{opacity:.5;cursor:default}
[data-pp-empty]{margin:0;padding:6px 8px;font-size:12px;color:var(--muted)}
@media (max-width:640px){
[data-pp-row][data-multi]{grid-template-columns:16px minmax(0,1fr)}
[data-pp-row][data-multi]>[data-pp-actions]{grid-column:2}
}
`

export function PanelStyles() {
  return <style>{PANEL_CSS}</style>
}

// The panel's root: sets the type scale and stops sideways scroll.
export function PanelRoot(props: { kind: string; children: ReactNode }) {
  return (
    <div data-pp data-panel-kind={props.kind} style={{ display: 'flex', flexDirection: 'column' }}>
      <PanelStyles />
      {props.children}
    </div>
  )
}

export function PanelChip(props: { tone?: Tone; tip?: string; tap?: boolean; href?: string | null; children: ReactNode; [attr: `data-${string}`]: unknown }) {
  const { tone = 'muted', tip, tap, href, children, ...rest } = props
  return (
    <Tooltip text={tip}>
      {href ? (
        <a data-pp-chip data-tone={tone} href={linkHref(href)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }} {...rest}>
          {children}
        </a>
      ) : (
        <span data-pp-chip data-tone={tone} data-tap={tap && tip ? '' : undefined} {...rest}>
          {children}
        </span>
      )}
    </Tooltip>
  )
}

// The top bar: a title and chips at the start, controls at the end.
export function PanelToolbar(props: { children?: ReactNode; end?: ReactNode }) {
  return (
    <div data-pp-toolbar>
      {props.children}
      {props.end && <span data-pp-toolbar-end>{props.end}</span>}
    </div>
  )
}

// A wrapped line of chips under the toolbar: the state of everything at a glance.
export function PanelStrip(props: { children: ReactNode }) {
  return <div data-pp-strip>{props.children}</div>
}

export function PanelSection(props: { id: string; title: string; count?: number; tone?: Tone; summary?: string; open?: boolean; children: ReactNode }) {
  return (
    <details data-pp-section data-panel-fold={props.id} open={props.open}>
      <summary>
        <ChevronRight size={12} data-pp-chevron aria-hidden="true" />
        {props.title}
        {props.count !== undefined && props.count > 0 && <PanelChip tone={props.tone ?? 'info'}>{props.count}</PanelChip>}
        {props.summary && <span data-pp-summary>{props.summary}</span>}
      </summary>
      {props.children}
    </details>
  )
}

export function PanelList(props: { children: ReactNode }) {
  return <ul data-pp-list>{props.children}</ul>
}

export function PanelEmpty(props: { children: ReactNode; role?: string }) {
  return (
    <p data-pp-empty role={props.role}>
      {props.children}
    </p>
  )
}

// One item on one or two lines: icon, title, chips and age, then an optional
// meta line, with the actions on the right (under the text on a phone when
// there is more than one). `href` makes the title a link. `tip` is the full
// text of the meta line, shown on hover or tap when it is cut off.
export function PanelRow(props: {
  icon: LucideIcon
  title: string
  href?: string | null
  chips?: ReactNode
  age?: string | null
  ageTip?: string
  meta?: string | null
  actions?: ReactNode
  multi?: boolean
  // No tooltip on the title: its text is short and always fits.
  noTip?: boolean
  [attr: `data-${string}`]: unknown
}) {
  const { icon: Icon, title, href, chips, age, ageTip, meta, actions, multi, noTip, ...rest } = props
  return (
    <li data-pp-row data-multi={multi ? '' : undefined} {...rest}>
      <span data-pp-row-icon>
        <Icon size={14} aria-hidden="true" />
      </span>
      <span data-pp-row-main>
        <span data-pp-row-line>
          <Tooltip text={noTip ? null : title} display="block">
            {href ? (
              <a data-pp-row-title href={linkHref(href)} target="_blank" rel="noreferrer">
                {title}
              </a>
            ) : (
              <span data-pp-row-title>{title}</span>
            )}
          </Tooltip>
          {chips}
          {age && (
            <Tooltip text={ageTip}>
              <span data-pp-age>{age}</span>
            </Tooltip>
          )}
        </span>
        {meta && (
          <Tooltip text={meta} display="block">
            <span data-pp-row-meta style={{ display: 'block' }}>
              {meta}
            </span>
          </Tooltip>
        )}
      </span>
      {actions && <span data-pp-actions>{actions}</span>}
    </li>
  )
}

// A row's action: a link when it has `href`, else a button.
export function PanelAct(props: { label: string; icon?: LucideIcon; href?: string; onClick?: () => void; disabled?: boolean; primary?: boolean; tip?: string; [attr: `data-${string}`]: unknown }) {
  const { label, icon: Icon, href, onClick, disabled, primary, tip, ...rest } = props
  const inner = (
    <>
      {Icon && <Icon size={13} aria-hidden="true" />}
      {label}
    </>
  )
  return (
    <Tooltip text={tip}>
      {href ? (
        <a data-pp-act data-pp-primary={primary ? '' : undefined} href={linkHref(href)} target="_blank" rel="noreferrer" {...rest}>
          {inner}
        </a>
      ) : (
        <button data-pp-act data-pp-primary={primary ? '' : undefined} type="button" disabled={disabled} onClick={onClick} {...rest}>
          {inner}
        </button>
      )}
    </Tooltip>
  )
}

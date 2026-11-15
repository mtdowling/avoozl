// The parts every side-panel view is built from: a one-line header, a folding
// section, a dense row, a status chip and an empty state. A new section is a
// few lines:
//
//   <PanelSection id="x" title="X" count={rows.length} summary="2 held">
//     {rows.length ? rows.map((r) => <PanelRow key={r.id} icon={Inbox} title={r.title} age="3 min" />) : <PanelEmpty>Nothing here.</PanelEmpty>}
//   </PanelSection>
//
// Sizes are Kiro Crew's own, read from its Crew log and Git panels: a section
// header is 12px semibold with a 13px chevron, 10px 12px padding and an 11px
// right-hand summary; rows are 12px with 4px 12px padding and an 11px muted
// second line; chips are 10px; small buttons are 11px with a 6px radius; an
// empty state is 12px muted. Hover is the theme's --bg-hover. On a phone (a
// narrow screen) nothing changes size: rows stay two lines, buttons stay compact,
// nothing scrolls sideways and nothing is sticky. Colors are theme
// variables only. Kept free of data reads: callers pass what to show.
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, type LucideIcon } from './icons.ts'
import { Tooltip } from './Tooltip.tsx'
import { linkHref } from './views-api.ts'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted'

// Every size and the phone rules live here once, keyed by data attributes.
export const PANEL_CSS = `
[data-pp]{container-type:inline-size;font-size:12px;line-height:18px;min-width:0;max-width:100%;overflow-x:hidden;box-sizing:border-box;color:var(--text)}
[data-pp] *{box-sizing:border-box}
[data-pp-head]{display:flex;align-items:center;flex-wrap:nowrap;gap:6px;padding:6px 12px;border-bottom:1px solid var(--border);min-width:0}
[data-pp-head-name]{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--text-strong,var(--text))}
[data-pp-head-instance]{font-weight:400;color:var(--muted)}
[data-pp-head-tools]{flex:none;display:inline-flex;align-items:center;gap:2px}
[data-pp-head-end]{flex:none;display:inline-flex;align-items:center;gap:4px;margin-left:auto}
[data-pp-head-chip]{flex:none;display:inline-flex;align-items:center;gap:6px;padding:2px 4px;background:transparent;border:0;border-radius:6px;font:inherit;font-size:12px;font-weight:500;line-height:16px;white-space:nowrap;color:var(--text);cursor:pointer}
[data-pp-head-chip]:hover{background:var(--bg-hover)}
[data-pp-head-chip-count]{color:var(--muted);font-variant-numeric:tabular-nums}
[data-pp-hand]{flex:none;color:var(--warn,var(--warning,#b7791f))}
[data-pp-pulse]{flex:none;width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 2px color-mix(in srgb,var(--ok) 25%,transparent);animation:pp-pulse 2s ease-in-out infinite}
@keyframes pp-pulse{0%,100%{box-shadow:0 0 0 2px color-mix(in srgb,var(--ok) 25%,transparent)}50%{box-shadow:0 0 0 5px color-mix(in srgb,var(--ok) 0%,transparent)}}
@media (prefers-reduced-motion:reduce){[data-pp-pulse]{animation:none}}
[data-pp-section]{border-bottom:1px solid var(--border)}
[data-pp-section-head]{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;background:transparent;border:0;border-radius:0;text-align:left;cursor:pointer;color:var(--text);font:inherit;font-size:12px;font-weight:600;transition:background-color .12s}
[data-pp-section-head]:hover{background:var(--bg-hover)}
[data-pp-section-head] [data-pp-chevron]{flex:none;color:var(--muted)}
[data-pp-section-title]{color:var(--text-strong,var(--text))}
[data-pp-summary]{margin-left:auto;max-width:55%;font-size:11px;font-weight:400;color:var(--muted);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
[data-pp-list]{list-style:none;margin:0;padding:0 0 8px}
[data-pp-row]{display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:center;column-gap:8px;padding:4px 12px;transition:background-color .12s}
[data-pp-row]:hover{background:var(--bg-hover)}
[data-pp-row-icon]{display:inline-flex;color:var(--muted)}
[data-pp-row-main]{display:flex;flex-direction:column;min-width:0}
[data-pp-row-line]{display:flex;flex-wrap:nowrap;align-items:center;gap:0 6px;min-width:0;overflow:hidden}
[data-pp-row-title]{display:block;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
a[data-pp-row-title]{text-decoration:none}
a[data-pp-row-title]:hover{text-decoration:underline}
[data-pp-row-line]>[data-tooltip-anchor]{flex:0 0 auto;max-width:100%}
[data-pp-row-line]>[data-tooltip-anchor]:first-child{flex:0 1 auto;min-width:0}
[data-pp-row-line]>[data-tooltip-anchor]:has([data-pp-age]){margin-left:auto}
[data-pp-age]{flex:none;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
[data-pp-row-meta]{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
[data-pp-actions]{display:inline-flex;align-items:center;gap:4px;flex:none}
[data-pp-chip]{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;min-width:0;max-width:10rem;padding:2px 6px;border-radius:4px;font-size:10px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);background:var(--bg-hover)}
[data-pp-chip][data-tone=ok]{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent)}
[data-pp-chip][data-tone=warn]{color:var(--warning,#b7791f);background:color-mix(in srgb,var(--warning,#b7791f) 15%,transparent)}
[data-pp-chip][data-tone=danger]{color:var(--danger);background:color-mix(in srgb,var(--danger) 15%,transparent)}
[data-pp-chip][data-tone=info]{color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent)}
[data-pp-act],[data-pp-icon]{min-height:22px;background:transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:2px 8px;border:1px solid var(--border);border-radius:6px;color:var(--muted);font:inherit;font-size:11px;line-height:16px;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color .12s,color .12s}
[data-pp-act]:hover,[data-pp-icon]:hover{background:var(--bg-hover);color:var(--text)}
[data-pp-act][data-pp-primary]{border-color:var(--accent);color:var(--accent)}
[data-pp-act]:disabled,[data-pp-icon]:disabled{opacity:.6;cursor:default}
[data-pp-icon][data-bare]{padding:2px 5px;border-color:transparent}
[data-pp-cells]{padding:0 12px 8px}
[data-pp-empty]{margin:0;padding:0 12px 12px;font-size:12px;color:var(--muted)}
@media (max-width:640px){
[data-pp-narrow-hide]{display:none}
[data-pp-act][data-narrow-icon]{padding:2px 6px}
}
@container (max-width:520px){
[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4)){flex-wrap:wrap}
[data-pp-row-line]:has(>[data-tooltip-anchor]:nth-child(n+4))>[data-tooltip-anchor]:first-child{max-width:100%}
}
@container (max-width:520px){
[data-pp-row][data-multi]{grid-template-columns:14px minmax(0,1fr)}
[data-pp-row][data-multi]>[data-pp-actions]{grid-column:2}
}
`

export function PanelStyles() {
  return <style>{PANEL_CSS}</style>
}

// Which sections are open, kept in the browser so the panel looks the same
// next time. Each section registers itself so the header's one icon can fold
// or open all of them.
const FOLDS_KEY = 'avoozl.panel.folds'
interface Folds {
  isOpen: (id: string, fallback: boolean) => boolean
  toggle: (id: string, fallback: boolean) => void
  register: (id: string, fallback: boolean) => void
  allOpen: boolean
  setAll: (open: boolean) => void
  show: (id: string) => void
}
const FoldsContext = createContext<Folds | null>(null)

function readFolds(): Record<string, boolean> {
  try {
    const value = JSON.parse(window.localStorage.getItem(FOLDS_KEY) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function useFoldsState(): Folds {
  const [saved, setSaved] = useState(readFolds)
  const [known, setKnown] = useState<Record<string, boolean>>({})
  const keep = useCallback((next: Record<string, boolean>) => {
    setSaved(next)
    try {
      window.localStorage.setItem(FOLDS_KEY, JSON.stringify(next))
    } catch {
      // No storage: the folds last until the panel closes.
    }
  }, [])
  const isOpen = useCallback((id: string, fallback: boolean) => saved[id] ?? fallback, [saved])
  const register = useCallback((id: string, fallback: boolean) => setKnown((now) => (now[id] === fallback ? now : { ...now, [id]: fallback })), [])
  const ids = Object.keys(known)
  return useMemo(
    () => ({
      isOpen,
      register,
      toggle: (id, fallback) => keep({ ...saved, [id]: !(saved[id] ?? fallback) }),
      allOpen: ids.length > 0 && ids.every((id) => saved[id] ?? known[id]),
      setAll: (open) => keep({ ...saved, ...Object.fromEntries(ids.map((id) => [id, open])) }),
      show: (id) => keep({ ...saved, [id]: true }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, register, keep, saved, known],
  )
}

// The panel's root: sets the type scale, stops sideways scroll and keeps the folds.
export function PanelRoot(props: { kind: string; children: ReactNode }) {
  const folds = useFoldsState()
  return (
    <FoldsContext.Provider value={folds}>
      <div data-pp data-panel-kind={props.kind} style={{ display: 'flex', flexDirection: 'column' }}>
        <PanelStyles />
        {props.children}
      </div>
    </FoldsContext.Provider>
  )
}

export function PanelChip(props: { tone?: Tone; tip?: string; href?: string | null; children: ReactNode; [attr: `data-${string}`]: unknown }) {
  const { tone = 'muted', tip, href, children, ...rest } = props
  return (
    <Tooltip text={tip}>
      {href ? (
        <a data-pp-chip data-tone={tone} href={linkHref(href)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }} {...rest}>
          {children}
        </a>
      ) : (
        <span data-pp-chip data-tone={tone} {...rest}>
          {children}
        </span>
      )}
    </Tooltip>
  )
}

// The one thin line at the top: the name, small icon tools (Refresh, then
// fold all), status chips, and the line's pause button at the far right.
export function PanelHeader(props: { name: string; instance?: string | null; tip?: string; tools?: ReactNode; chips?: ReactNode; end?: ReactNode }) {
  const folds = useContext(FoldsContext)
  const label = folds?.allOpen ? 'Collapse all sections' : 'Expand all sections'
  const Icon = folds?.allOpen ? ChevronsDownUp : ChevronsUpDown
  return (
    <div data-pp-head>
      <Tooltip text={props.tip ?? (props.instance ? `${props.name} · ${props.instance}` : props.name)}>
        <span data-pp-head-name>
          {props.name}
          {props.instance && <span data-pp-head-instance> · {props.instance}</span>}
        </span>
      </Tooltip>
      <span data-pp-head-tools>
        {props.tools}
        {folds && (
          <Tooltip text={label}>
            <button type="button" data-pp-icon data-bare data-pp-toggle-all aria-label={label} aria-pressed={folds.allOpen} onClick={() => folds.setAll(!folds.allOpen)}>
              <Icon size={13} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </span>
      {props.chips}
      {props.end && <span data-pp-head-end>{props.end}</span>}
    </div>
  )
}

// A count in the header, flat in the row: an icon, its words, then the count
// in muted. A narrow panel shows the icon and count only. A click opens that
// section and scrolls to it.
export function PanelHeadChip(props: { icon: ReactNode; count: number; words: string; tip: string; section: string; [attr: `data-${string}`]: unknown }) {
  const { icon, count, words, tip, section, ...rest } = props
  const folds = useContext(FoldsContext)
  const jump = () => {
    folds?.show(section)
    requestAnimationFrame(() => document.querySelector(`[data-panel-fold="${section}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }
  return (
    <Tooltip text={tip}>
      <button type="button" data-pp-head-chip aria-label={`${words}: ${count}`} onClick={jump} {...rest}>
        {icon}
        <span data-pp-narrow-hide aria-hidden="true">
          {words}
        </span>
        <span data-pp-head-chip-count aria-hidden="true">
          {count}
        </span>
      </button>
    </Tooltip>
  )
}

export function PanelSection(props: { id: string; title: string; count?: number; tone?: Tone; summary?: string; open?: boolean; children: ReactNode }) {
  const folds = useContext(FoldsContext)
  const fallback = Boolean(props.open)
  useLayoutEffect(() => folds?.register(props.id, fallback), [folds?.register, props.id, fallback])
  const open = folds ? folds.isOpen(props.id, fallback) : fallback
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div data-pp-section data-panel-fold={props.id} data-open={open ? '' : undefined}>
      <button type="button" data-pp-section-head aria-expanded={open} onClick={() => folds?.toggle(props.id, fallback)}>
        <Chevron size={13} data-pp-chevron aria-hidden="true" />
        <span data-pp-section-title>{props.title}</span>
        {props.count !== undefined && props.count > 0 && <PanelChip tone={props.tone ?? 'info'}>{props.count}</PanelChip>}
        {props.summary && <span data-pp-summary>{props.summary}</span>}
      </button>
      {open && props.children}
    </div>
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
// `narrowIcon` shows only the icon on a narrow panel; `name` is then its
// accessible name (and the tooltip says the rest).
export function PanelAct(props: { label: string; icon?: LucideIcon; href?: string; onClick?: () => void; disabled?: boolean; primary?: boolean; tip?: string; narrowIcon?: boolean; name?: string; [attr: `data-${string}`]: unknown }) {
  const { label, icon: Icon, href, onClick, disabled, primary, tip, narrowIcon, name, ...rest } = props
  const inner = (
    <>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {narrowIcon ? <span data-pp-narrow-hide>{label}</span> : label}
    </>
  )
  const named = { 'aria-label': name, 'data-narrow-icon': narrowIcon ? '' : undefined }
  return (
    <Tooltip text={tip}>
      {href ? (
        <a data-pp-act data-pp-primary={primary ? '' : undefined} href={linkHref(href)} target="_blank" rel="noreferrer" {...named} {...rest}>
          {inner}
        </a>
      ) : (
        <button data-pp-act data-pp-primary={primary ? '' : undefined} type="button" disabled={disabled} onClick={onClick} {...named} {...rest}>
          {inner}
        </button>
      )}
    </Tooltip>
  )
}

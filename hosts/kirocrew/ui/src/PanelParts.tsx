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
import { Tooltip } from './ui/Tooltip.tsx'
import { linkHref } from './views-api.ts'
import { Box } from './ui/Box'
import { PanelCss } from './ui/PageStyles'
import { PlainLink } from './ui/Plain'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted'

export function PanelStyles() {
  return <PanelCss />
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
      <Box data-pp data-panel-kind={props.kind} css-display="flex" css-flex-direction="column">
        <PanelStyles />
        {props.children}
      </Box>
    </FoldsContext.Provider>
  )
}

export function PanelChip(props: { tone?: Tone; tip?: string; href?: string | null; children: ReactNode; [attr: `data-${string}`]: unknown }) {
  const { tone = 'muted', tip, href, children, ...rest } = props
  return (
    <Tooltip text={tip}>
      {href ? (
        <PlainLink data-pp-chip data-tone={tone} href={linkHref(href)} target="_blank" rel="noreferrer" css-text-decoration="none" {...rest}>
          {children}
        </PlainLink>
      ) : (
        <span data-pp-chip data-tone={tone} {...rest}>
          {children}
        </span>
      )}
    </Tooltip>
  )
}

// The one thin line at the top: the name ("Avoozl" opens the app page), small
// icon tools (Refresh, then fold all), and the line's pause button at the far
// right.
export function PanelHeader(props: {
  name: string
  instance?: string | null
  workspace?: string | null
  tip?: string
  onName?: () => void
  nameTip?: string
  tools?: ReactNode
  end?: ReactNode
}) {
  const folds = useContext(FoldsContext)
  const label = folds?.allOpen ? 'Collapse all sections' : 'Expand all sections'
  const Icon = folds?.allOpen ? ChevronsDownUp : ChevronsUpDown
  // "Avoozl · <instance> · <workspace>"; the workspace truncates first. A
  // phone shows the workspace alone (the brand and instance hide there).
  return (
    <div data-pp-head>
      <span data-pp-head-name>
        <span data-pp-head-brand>
          {props.onName ? (
            <Tooltip text={props.nameTip}>
              <button type="button" data-pp-head-link aria-label={props.nameTip} onClick={props.onName}>
                {props.name}
              </button>
            </Tooltip>
          ) : (
            props.name
          )}
          {props.instance && (
            <Tooltip text={props.tip}>
              <span data-pp-head-instance>· {props.instance}</span>
            </Tooltip>
          )}
        </span>
        {props.workspace && (
          <span data-pp-head-workspace>
            <span data-pp-head-dot>· </span>
            {props.workspace}
          </span>
        )}
      </span>
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
      {props.end && <span data-pp-head-end>{props.end}</span>}
    </div>
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
            <Box data-pp-row-meta as="span" css-display="block">
              {meta}
            </Box>
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
export function PanelAct(props: {
  label: string
  icon?: LucideIcon
  href?: string
  onClick?: () => void
  disabled?: boolean
  primary?: boolean
  tip?: string
  narrowIcon?: boolean
  name?: string
  [attr: `data-${string}`]: unknown
}) {
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

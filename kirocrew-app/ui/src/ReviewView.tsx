// The spec page's Review view (R104.9-R104.11, design §4.33): the spec files
// at one revision as tabs, a rail of finding cards with severity borders,
// severity and state filters with counts, the person's actions, and links to
// the review and planner chats. It reads plan.review.view and writes only a
// person's decision (plan.review.finding.decide).
// Each card sits level with its anchor's first block; cards that would
// overlap stack in line order. A card click scrolls to and highlights its
// lines; a click on highlighted text selects its card. Moved or removed
// findings list first. A narrow view puts each card after its block.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Markdown } from './Markdown.tsx'
import { blocks } from './markdown.ts'
import { SmallBtn } from './controls.tsx'
import { Tooltip } from './Tooltip.tsx'
import { CircleAlert, Info, MessageSquare } from './icons.ts'
import { usePhone } from './list-detail.ts'
import { shortHash } from './plans-api.ts'
import { linkHref } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import {
  ALL_TAB,
  DECIDED,
  SEVERITIES,
  SEVERITY_COLOR,
  SEVERITY_INK,
  SEVERITY_LABEL,
  STATES,
  TAB_LABEL,
  blockFor,
  blocksIn,
  chipCounts,
  stackCards,
  filterFindings,
  lineText,
  openCounts,
  renderText,
  tabKey,
  type ChatLink,
  type FindingAction,
  type FindingSeverity,
  type ReviewClient,
  type ReviewFinding,
  type ReviewPlace,
  type ReviewViewData,
} from './review-view.ts'

const PROSE = '72ch'
// Below this width the text and the rail do not fit side by side.
const WIDE = 720
const HIT_STYLE = `[data-review-doc] [data-review-hit]{background:color-mix(in srgb,var(--accent) 14%,transparent);box-shadow:-3px 0 0 var(--accent);border-radius:4px}
[data-review-doc] [data-source-line]{cursor:default}`
const lineOf = (el: Element) => Number(el.getAttribute('data-source-line'))

function Chat(props: { label: string; link: ChatLink | null; attr: string }) {
  if (!props.link) return null
  const href = linkHref(props.link.href)
  return href ? (
    <a href={linkHref(props.link.href)} className="text-xs underline" {...{ [props.attr]: 'open' }}>
      {props.label}
    </a>
  ) : (
    <span className="text-xs text-muted" {...{ [props.attr]: 'closed' }}>
      {props.label.replace(/^Open (\w)/, (_, c: string) => c.toUpperCase())}: Chat closed
    </span>
  )
}

function Chip(props: { label: string; count?: number; on: boolean; onClick: () => void; attr: Record<string, string> }) {
  return (
    <SmallBtn primary={props.on} onClick={props.onClick} attrs={{ 'aria-pressed': props.on ? 'true' : 'false', ...props.attr }}>
      {props.label}
      {props.count !== undefined && <span style={{ marginLeft: 4, opacity: 0.8 }}>{props.count}</span>}
    </SmallBtn>
  )
}

// A toggle: the value in or out of the list, kept in the page's own order.
const toggle = <T extends string>(list: T[], value: T, order: readonly T[]): T[] => order.filter((item) => (item === value ? !list.includes(item) : list.includes(item)))

const ACTION_TEXT: Record<FindingAction, string> = {
  accept: 'Accepted',
  reject: 'Rejected',
  defer: 'Deferred',
  resolve: 'Resolved',
  reopen: 'Reopened',
}

// Kiro Crew's own accent for an action, as on its Needs your input cards.
const ACCENT = 'color-mix(in srgb, var(--aim) 72%, var(--text-strong, var(--text)))'
const SEVERITY_ICON: Record<FindingSeverity, typeof Info> = { blocker: CircleAlert, warn: MessageSquare, info: Info }
const CARD_STYLE = `[data-finding-card] [data-card-btn]{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:500;line-height:1;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;max-width:100%}
[data-finding-card] [data-card-btn]:hover:not(:disabled){background:var(--bg-hover)}
[data-finding-card] [data-card-btn]:disabled{opacity:.55;cursor:default}
[data-finding-card] [data-card-btn][data-main]{color:${ACCENT};border-color:color-mix(in srgb,${ACCENT} 45%,var(--border))}
[data-finding-card] [data-card-btn]:focus-visible{outline:2px solid ${ACCENT};outline-offset:1px}
[data-finding-card] [data-clamp]{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}`

function CardBtn(props: { main?: boolean; disabled?: boolean; onClick: () => void; attr: Record<string, string>; children: string }) {
  return (
    <button type="button" data-card-btn data-main={props.main ? 'true' : undefined} disabled={props.disabled} onClick={props.onClick} {...props.attr}>
      {props.children}
    </button>
  )
}

// The main action for a finding's state, then the others, and the hint
// under them.
function actionsFor(finding: ReviewFinding): { main: FindingAction; rest: FindingAction[]; hint: string } {
  if (DECIDED.has(finding.state)) return { main: 'reopen', rest: [], hint: 'Reopen undoes the last decision.' }
  if (finding.state === 'fixed') return { main: 'resolve', rest: ['accept', 'reject', 'defer'], hint: 'The planner fixed it. Resolve closes it.' }
  return { main: 'accept', rest: ['reject', 'defer', 'resolve'], hint: 'Accept sends it to the planner to fix next. Reject needs a reason.' }
}
const ACTION_LABEL: Record<FindingAction, string> = { accept: 'Accept', reject: 'Reject', defer: 'Defer', resolve: 'Resolve', reopen: 'Reopen' }

function FindingCard(props: {
  finding: ReviewFinding
  busy: boolean
  onDecide: (action: FindingAction, note?: string) => Promise<boolean>
  onRevision: (hash: string) => void
  selected?: boolean
  onSelect?: () => void
  cardRef?: (el: HTMLElement | null) => void
  style?: CSSProperties
  // All findings: the file and lines lead the card.
  showFile?: boolean
}) {
  const { finding } = props
  const [asking, setAsking] = useState<'reject' | 'defer' | null>(null)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const send = async (action: FindingAction, text?: string) => {
    if (await props.onDecide(action, text)) {
      setAsking(null)
      setNote('')
    }
  }
  const act = (action: FindingAction) => (action === 'reject' || action === 'defer' ? setAsking(action) : void send(action))
  const actions = actionsFor(finding)
  const Icon = SEVERITY_ICON[finding.severity]
  const ink = SEVERITY_INK[finding.severity]
  // A click on a control does not select the card.
  const select = (event: { target: EventTarget }) => {
    if ((event.target as Element).closest?.('button, a, textarea, label, input')) return
    props.onSelect?.()
  }
  return (
    <article
      data-finding-card={finding.id}
      data-severity={finding.severity}
      data-finding-state={finding.state}
      data-selected={props.selected ? 'true' : undefined}
      ref={props.cardRef}
      onClick={select}
      className="text-sm"
      style={{
        ...props.style,
        boxShadow: props.selected ? `0 0 0 2px color-mix(in srgb, ${ACCENT} 55%, transparent)` : undefined,
        cursor: props.onSelect ? 'pointer' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
        border: `1.5px solid ${SEVERITY_COLOR[finding.severity]}`,
        borderRadius: 12,
        padding: '10px 12px',
        background: 'var(--card, var(--bg))',
        color: 'var(--text)',
        overflowWrap: 'anywhere',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Icon size={14} aria-hidden="true" style={{ flex: 'none', color: ink }} />
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <Tooltip text={finding.claim} display="block">
          <h4 data-finding-title className="m-0" style={{ flex: '1 1 auto', minWidth: 0, margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {finding.claim}
          </h4>
        </Tooltip>
        </div>
        <span data-state-label className="text-muted" style={{ flex: 'none', fontSize: 11 }}>
          {finding.state}
        </span>
      </div>
      <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <p className="m-0" style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px', fontSize: 11 }}>
          <span data-severity-label style={{ fontWeight: 600, color: ink }}>
            {SEVERITY_LABEL[finding.severity]}
          </span>
          <span className="text-muted">{finding.category}</span>
          <code className="text-muted" data-finding-lines={props.showFile ? 'file' : undefined}>
            {lineText(finding.anchor)}
          </code>
          {finding.anchor.moved && (
            <span data-moved className="text-muted">
              Moved or removed (from <code>{shortHash(finding.anchor.revisionHash)}</code>)
            </span>
          )}
        </p>
        <p
          data-finding-body
          data-clamp={open ? undefined : 'true'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="m-0 whitespace-pre-wrap"
          style={{ margin: 0, fontSize: 12, color: 'color-mix(in srgb, var(--text) 85%, transparent)', cursor: 'pointer', whiteSpace: 'pre-wrap' }}
        >
          {finding.evidence}
        </p>
        <p className="m-0" data-planner-response style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
          {finding.answer ? (
            <>
              Planner:{' '}
              {finding.answer.action === 'fixed' && finding.answer.revisionHash ? (
                <>
                  Fixed in{' '}
                  <button type="button" className="underline" data-fixed-revision style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }} onClick={() => props.onRevision(finding.answer!.revisionHash!)}>
                    <code>{shortHash(finding.answer.revisionHash)}</code>
                  </button>
                  .
                </>
              ) : (
                'Answered.'
              )}{' '}
              {finding.answer.text}
            </>
          ) : (
            <span className="text-muted">Planner has not answered.</span>
          )}
        </p>
        {finding.decisions.length > 0 && (
          <ul className="m-0 text-muted" data-finding-history style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2, listStyle: 'none', fontSize: 11 }}>
            {finding.decisions.map((d, i) => (
              <li key={i}>
                {ACTION_TEXT[d.action]} by {d.by} at <code>{shortHash(d.revisionHash)}</code>
                {d.note ? ` · ${d.note}` : ''}
              </li>
            ))}
          </ul>
        )}
        {asking ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
            <label style={{ fontSize: 12 }}>
              {asking === 'reject' ? 'Reason (required)' : 'Note (optional)'}
              <textarea
                data-finding-note
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-0.5 w-full rounded border p-1 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', width: '100%', borderRadius: 6, marginTop: 2 }}
              />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <CardBtn main disabled={props.busy || (asking === 'reject' && !note.trim())} onClick={() => void send(asking, note.trim())} attr={{ 'data-finding-confirm': asking }}>
                {asking === 'reject' ? 'Reject' : 'Defer'}
              </CardBtn>
              <CardBtn disabled={props.busy} onClick={() => setAsking(null)} attr={{ 'data-finding-cancel': '' }}>
                Cancel
              </CardBtn>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-finding-actions>
              {[actions.main, ...actions.rest].map((action) => (
                <CardBtn key={action} main={action === actions.main} disabled={props.busy} onClick={() => act(action)} attr={{ 'data-finding-action': action }}>
                  {ACTION_LABEL[action]}
                </CardBtn>
              ))}
            </div>
            <p className="m-0 text-muted" data-finding-hint style={{ margin: 0, fontSize: 11 }}>
              {actions.hint}
            </p>
          </div>
        )}
      </div>
    </article>
  )
}

// The tab bar: one tab per spec file with its open-finding count, then All
// findings. Arrow keys, Home and End move between tabs (WAI-ARIA tabs).
// The spec page's tab bar reuses it (SpecTabs), with its own labels and
// attributes, so the two bars look and move the same.
export function DocTabs(props: {
  tabs: string[]
  current: string
  counts: Record<string, number>
  onPick: (tab: string) => void
  // The spec page's bar: its own accessible name, data attribute and ids, and
  // a count only on the tabs that have one.
  bar?: { label: string; attr: string; prefix: string; labels?: Record<string, string> }
}) {
  const bar_ = props.bar ?? { label: 'Spec files', attr: 'data-review-tab', prefix: 'review-tab' }
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const bar = useRef<HTMLDivElement>(null)
  // On a narrow screen the bar scrolls sideways: keep the open tab in view,
  // moving only the bar, never the page.
  useEffect(() => {
    const el = refs.current.get(props.current),
      box = bar.current
    if (!el || !box) return
    if (el.offsetLeft < box.scrollLeft) box.scrollLeft = el.offsetLeft
    else if (el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = el.offsetLeft + el.offsetWidth - box.clientWidth
  }, [props.current])
  const key = (event: KeyboardEvent) => {
    const next = tabKey(event.key, props.tabs, props.current)
    if (!next) return
    event.preventDefault()
    props.onPick(next)
    refs.current.get(next)?.focus()
  }
  return (
    <div
      ref={bar}
      role="tablist"
      aria-label={bar_.label}
      data-review-tabs={props.bar ? undefined : ''}
      {...(props.bar ? { [`${bar_.attr}s`]: '' } : {})}
      onKeyDown={key}
      style={{ position: 'relative', display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', overflowX: 'auto', scrollbarWidth: 'thin', minWidth: 0 }}
    >
      {props.tabs.map((tab) => {
        const on = tab === props.current,
          n = props.counts[tab] ?? 0
        return (
          <button
            key={tab}
            ref={(el) => {
              if (el) refs.current.set(tab, el)
              else refs.current.delete(tab)
            }}
            type="button"
            role="tab"
            id={`${bar_.prefix}-${tab.replace(/\W/g, '-')}`}
            aria-selected={on}
            aria-controls={`${bar_.prefix}-panel`}
            tabIndex={on ? 0 : -1}
            {...{ [bar_.attr]: tab }}
            onClick={() => props.onPick(tab)}
            style={{
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              marginBottom: -1,
              border: 0,
              borderBottom: `2px solid ${on ? ACCENT : 'transparent'}`,
              borderRadius: 0,
              background: 'transparent',
              color: on ? 'var(--text-strong, var(--text))' : 'var(--muted)',
              fontSize: 13,
              fontWeight: on ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {bar_.labels?.[tab] ?? TAB_LABEL[tab] ?? tab}
            {(!props.bar || props.counts[tab] !== undefined) && (
            <span
              data-tab-count={n}
              aria-label={`${n} open`}
              style={{
                minWidth: 18,
                padding: '0 6px',
                borderRadius: 999,
                fontSize: 11,
                lineHeight: '18px',
                textAlign: 'center',
                fontFamily: 'inherit',
                fontVariantNumeric: 'tabular-nums',
                background: n ? 'var(--bg-hover)' : 'transparent',
                color: n ? 'var(--text)' : 'var(--muted)',
                opacity: n ? 1 : 0.6,
              }}
            >
              {n}
            </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function ReviewView(props: { workspaceId: string; client: ReviewClient; place: ReviewPlace; onPlace: (place: ReviewPlace) => void }) {
  const { place } = props
  const phone = usePhone()
  const [data, setData] = useState<ReviewViewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      setData(await props.client.view(props.workspaceId, place.plan, place.rev))
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workspaceId, place.plan, place.rev])
  useEffect(() => {
    void load()
  }, [load])
  const set = (change: Partial<ReviewPlace>) => props.onPlace({ ...place, ...change })
  const decide = async (finding: ReviewFinding, action: FindingAction, note?: string) => {
    if (!data) return false
    setBusy(true)
    setError(null)
    try {
      await props.client.decide(props.workspaceId, finding.id, action, data.revisionHash, note)
      await load()
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }
  const files = data ? Object.keys(data.files) : []
  const tabs = data ? [...files, ALL_TAB] : []
  const tab = place.file && tabs.includes(place.file) ? place.file : (files[0] ?? (data ? ALL_TAB : null))
  const all = tab === ALL_TAB
  const file = all ? null : tab
  const counts = chipCounts(data?.findings ?? [], place)
  const open = openCounts(data?.findings ?? [])
  const shown = filterFindings(data?.findings ?? [], place)
  const inFile = shown.filter((f) => f.anchor.file === file)
  const moved = inFile.filter((f) => f.anchor.moved)
  const placed = inFile.filter((f) => !f.anchor.moved)
  const text = file && data ? renderText(file, data.files[file]) : ''

  // The rail beside the text: measure each anchor's block and each card,
  // then stack the cards (stackCards). Narrow: cards go inline instead.
  const row = useRef<HTMLDivElement>(null)
  const doc = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const cardEls = useRef(new Map<string, HTMLElement>())
  const [wide, setWide] = useState(!phone)
  const [tops, setTops] = useState<Record<string, number>>({})
  const [areaHeight, setAreaHeight] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const scrollTo = useRef<'text' | 'card' | null>(null)
  const blockEls = () => [...(doc.current?.querySelectorAll('[data-source-line]') ?? [])].sort((a, b) => lineOf(a) - lineOf(b)) as HTMLElement[]
  const placedKey = placed.map((f) => f.id).join(' ')
  const layout = useCallback(() => {
    const width = row.current?.clientWidth ?? 0
    if (width) setWide(width >= WIDE)
    const box = area.current
    if (!box || !doc.current) return
    const els = blockEls(),
      lines = els.map(lineOf),
      base = box.getBoundingClientRect().top
    const cards = placed.map((f) => {
      const el = els[blockFor(lines, f.anchor.lineStart)]
      return { id: f.id, want: el ? Math.round(el.getBoundingClientRect().top - base) : 0, line: f.anchor.lineStart, height: cardEls.current.get(f.id)?.offsetHeight ?? 0 }
    })
    const next = stackCards(cards)
    setTops((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next))
    setAreaHeight(Math.max(0, ...cards.map((c) => next[c.id] + c.height)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedKey, text])
  useLayoutEffect(() => {
    layout()
  })
  useEffect(() => {
    const observer = new ResizeObserver(() => layout())
    for (const el of [row.current, doc.current, ...cardEls.current.values()]) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [layout, wide, data])
  // A new tab clears the selection, unless All findings sent the person
  // there to see one finding: then that one is selected and scrolled to.
  const jump = useRef<string | null>(null)
  useEffect(() => {
    const id = jump.current
    jump.current = null
    scrollTo.current = id ? 'text' : null
    setSelected(id)
  }, [tab])
  const openFinding = (finding: ReviewFinding) => {
    jump.current = finding.anchor.moved ? null : finding.id
    set({ file: finding.anchor.file })
  }

  // The selected finding's lines are highlighted; a card click also scrolls
  // to them, and a text click brings its card into view.
  useEffect(() => {
    const els = blockEls()
    for (const el of els) el.removeAttribute('data-review-hit')
    const finding = placed.find((f) => f.id === selected)
    if (!finding) return
    const lines = els.map(lineOf),
      hit = blocksIn(lines, finding.anchor.lineStart, finding.anchor.lineEnd).map((i) => els[i])
    for (const el of hit) el.setAttribute('data-review-hit', 'true')
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (scrollTo.current === 'text') hit[0]?.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
    if (scrollTo.current === 'card') cardEls.current.get(finding.id)?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
    scrollTo.current = null
  })
  const pick = (id: string) => {
    scrollTo.current = 'text'
    setSelected(id)
  }
  const pickText = (target: EventTarget) => {
    const el = (target as Element).closest?.('[data-source-line]')
    if (!el || (target as Element).closest('a, button')) return
    const els = blockEls(),
      lines = els.map(lineOf),
      at = els.indexOf(el as HTMLElement),
      found = placed.find((f) => blocksIn(lines, f.anchor.lineStart, f.anchor.lineEnd).includes(at))
    if (!found) return
    scrollTo.current = 'card'
    setSelected(found.id)
  }
  const firstLine = text ? (blocks(text)[0]?.line ?? 0) : 0
  const card = (finding: ReviewFinding, style?: CSSProperties) => (
    <FindingCard
      key={finding.id}
      finding={finding}
      busy={busy}
      selected={selected === finding.id}
      onSelect={finding.anchor.moved ? undefined : () => pick(finding.id)}
      cardRef={(el) => {
        if (el) cardEls.current.set(finding.id, el)
        else cardEls.current.delete(finding.id)
      }}
      style={style}
      onDecide={(action, note) => decide(finding, action, note)}
      onRevision={(hash) => set({ rev: hash })}
    />
  )
  const movedGroup = moved.length > 0 && (
    <div data-moved-group className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h4 className="m-0 text-xs font-medium text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Moved or removed
      </h4>
      {moved.map((f) => card(f))}
    </div>
  )
  return (
    <div
      data-review-view={place.plan}
      className="flex min-w-0 flex-col"
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 16, padding: phone ? '16px 0' : '16px 12px' }}
    >
      <div className="flex flex-wrap items-center gap-2" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <h3 className="m-0 text-base font-semibold" style={{ flex: '1 1 auto' }}>
          Review
          {data && (
            <span className="text-sm font-normal text-muted" style={{ marginLeft: 8 }}>
              at{' '}
              <Tooltip text={data.revisionHash}>
                <code data-review-revision>{shortHash(data.revisionHash)}</code>
              </Tooltip>
              {!data.current && ' · older revision'}
            </span>
          )}
        </h3>
        {data && !data.current && (
          <SmallBtn onClick={() => set({ rev: null })} attrs={{ 'data-review-current': true }}>
            Show current revision
          </SmallBtn>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}
      {!data ? (
        !error && <p className="m-0 text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="flex flex-col gap-1" style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-review-rounds>
            {data.rounds.length === 0 && <p className="m-0 text-sm text-muted">Not reviewed yet.</p>}
            {data.rounds.map((round) => (
              <div
                key={round.id}
                data-review-round={round.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px' }}
              >
                <span className="font-medium">
                  Round {round.round}
                  {data.rounds.some((r) => r.pass !== round.pass) ? ` of pass ${round.pass}` : ''}
                </span>
                <span className="text-muted">
                  {round.state} · {round.reviewerModel ?? 'reviewer not set'} at <code>{shortHash(round.revisionHash)}</code>
                </span>
                <Chat label="Open review chat" link={round.reviewChat} attr="data-review-chat" />
                <Chat label="Open planner chat" link={round.plannerChat} attr="data-planner-chat" />
              </div>
            ))}
          </div>
          {tab && <DocTabs tabs={tabs} current={tab} counts={{ ...open.byFile, [ALL_TAB]: open.total }} onPick={(name) => set({ file: name })} />}
          <div className="flex flex-wrap items-center gap-1.5" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }} data-review-filters>
            <span className="flex flex-wrap items-center gap-1.5" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }} role="group" aria-label="Severity" data-severity-filters>
              <span className="text-xs text-muted">Severity</span>
              {SEVERITIES.map((s) => (
                <Chip
                  key={s}
                  label={SEVERITY_LABEL[s]}
                  count={counts.severity[s] ?? 0}
                  on={place.severity.includes(s)}
                  onClick={() => set({ severity: toggle(place.severity, s, SEVERITIES) })}
                  attr={{ 'data-severity-filter': s }}
                />
              ))}
            </span>
            <span className="flex flex-wrap items-center gap-1.5" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginLeft: phone ? 0 : 12 }} role="group" aria-label="State" data-state-filters>
              <span className="text-xs text-muted">State</span>
              {STATES.filter((s) => counts.state[s] || place.state.includes(s)).map((s) => (
                <Chip
                  key={s}
                  label={s}
                  count={counts.state[s] ?? 0}
                  on={place.state.includes(s)}
                  onClick={() => set({ state: toggle(place.state, s, STATES) })}
                  attr={{ 'data-state-filter': s }}
                />
              ))}
            </span>
          </div>
          <style>{HIT_STYLE + CARD_STYLE}</style>
          {all ? (
            <section role="tabpanel" id="review-tab-panel" aria-labelledby="review-tab-all" data-review-all style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, maxWidth: 760 }}>
              {shown.length === 0 && (
                <p className="m-0 text-sm text-muted" data-review-empty>
                  {data.findings.length === 0 ? 'No findings.' : 'No finding matches these filters.'}
                </p>
              )}
              {shown.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  busy={busy}
                  showFile
                  onSelect={() => openFinding(f)}
                  onDecide={(action, note) => decide(f, action, note)}
                  onRevision={(hash) => set({ rev: hash })}
                />
              ))}
            </section>
          ) : (
          <div ref={row} data-review-layout={wide ? 'rail' : 'inline'} style={{ display: 'flex', alignItems: 'flex-start', gap: 20, minWidth: 0 }}>
            <section
              role="tabpanel"
              id="review-tab-panel"
              aria-labelledby={file ? `review-tab-${file.replace(/\W/g, '-')}` : undefined}
              aria-label={file ? undefined : 'No file'}
              data-review-doc={file ?? ''}
              className="min-w-0"
              style={{ flex: '1 1 0', minWidth: 0, border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--card, var(--bg))' }}
            >
              {!wide && movedGroup && <div style={{ marginBottom: 12 }}>{movedGroup}</div>}
              <div ref={doc} onClick={(event) => pickText(event.target)}>
                {file ? (
                  <Markdown
                    text={text}
                    measure={PROSE}
                    after={
                      wide
                        ? undefined
                        : (line, next) => {
                            const here = placed.filter((f) => (f.anchor.lineStart >= line || line === firstLine) && (next === null || f.anchor.lineStart < next))
                            return here.length ? (
                              <div data-inline-cards={line} className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {here.map((f) => card(f))}
                              </div>
                            ) : null
                          }
                    }
                  />
                ) : (
                  <p className="m-0 text-sm text-muted">This revision has no spec files.</p>
                )}
              </div>
              {!wide && inFile.length === 0 && (
                <p className="m-0 mt-2 text-sm text-muted" data-review-empty>
                  {data.findings.length === 0 ? 'No findings.' : 'No finding in this file matches these filters.'}
                </p>
              )}
            </section>
            {wide && (
              <aside
                aria-label="Findings"
                data-review-rail
                className="flex min-w-0 flex-col gap-2"
                style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: '0 0 340px', width: 340 }}
              >
                {movedGroup}
                <div ref={area} data-review-area style={{ position: 'relative', height: areaHeight }}>
                  {placed.map((f) => card(f, { position: 'absolute', left: 0, right: 0, top: tops[f.id] ?? 0 }))}
                </div>
                {inFile.length === 0 && (
                  <p className="m-0 text-sm text-muted" data-review-empty>
                    {data.findings.length === 0 ? 'No findings.' : 'No finding in this file matches these filters.'}
                  </p>
                )}
              </aside>
            )}
          </div>
          )}
        </>
      )}
    </div>
  )
}

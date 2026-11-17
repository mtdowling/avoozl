// The spec page's Review view (R104.9-R104.11, design §4.33): the spec files
// at one revision as tabs, a rail of finding cards with severity borders,
// severity and state filters with counts, the person's actions, and links to
// the review and planner chats. It reads plan.review.view and writes only a
// person's decision (plan.review.finding.decide).
// Each card sits level with its anchor's first block; cards that would
// overlap stack in line order. A card click scrolls to and highlights its
// lines; a click on highlighted text selects its card. Moved or removed
// findings list first. A narrow view puts each card after its block.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Markdown } from './Markdown.tsx'
import { blocks } from './markdown.ts'
import { SmallBtn } from './controls.tsx'
import { Tooltip } from './Tooltip.tsx'
import { usePhone } from './list-detail.ts'
import { shortHash } from './plans-api.ts'
import { linkHref } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import {
  DECIDED,
  SEVERITIES,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  STATES,
  TAB_LABEL,
  blockFor,
  blocksIn,
  chipCounts,
  stackCards,
  filterFindings,
  lineText,
  type ChatLink,
  type FindingAction,
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

const ACTION_TEXT: Record<FindingAction, string> = {
  accept: 'Accepted',
  reject: 'Rejected',
  defer: 'Deferred',
  resolve: 'Resolved',
  reopen: 'Reopened',
}

function FindingCard(props: {
  finding: ReviewFinding
  busy: boolean
  onDecide: (action: FindingAction, note?: string) => Promise<boolean>
  onRevision: (hash: string) => void
  selected?: boolean
  onSelect?: () => void
  cardRef?: (el: HTMLElement | null) => void
  style?: CSSProperties
}) {
  const { finding } = props
  const [asking, setAsking] = useState<'reject' | 'defer' | null>(null)
  const [note, setNote] = useState('')
  const decided = DECIDED.has(finding.state)
  const send = async (action: FindingAction, text?: string) => {
    if (await props.onDecide(action, text)) {
      setAsking(null)
      setNote('')
    }
  }
  return (
    <article
      data-finding-card={finding.id}
      data-severity={finding.severity}
      data-finding-state={finding.state}
      data-selected={props.selected ? 'true' : undefined}
      ref={props.cardRef}
      onClick={props.onSelect}
      className="flex min-w-0 flex-col gap-1.5 text-sm"
      style={{
        ...props.style,
        outline: props.selected ? '2px solid var(--accent)' : undefined,
        outlineOffset: 1,
        cursor: props.onSelect ? 'pointer' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${SEVERITY_COLOR[finding.severity]}`,
        borderRadius: 8,
        padding: '8px 10px',
        background: 'var(--card, var(--bg))',
        overflowWrap: 'anywhere',
      }}
    >
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px' }}>
        <span
          data-severity-label
          className="font-semibold"
          style={{
            color: finding.severity === 'info' ? 'var(--muted)' : SEVERITY_COLOR[finding.severity],
          }}
        >
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <span className="text-muted">{finding.category}</span>
        <code className="text-muted">{lineText(finding.anchor)}</code>
        {finding.anchor.moved && (
          <span data-moved className="text-muted">
            Moved or removed (from <code>{shortHash(finding.anchor.revisionHash)}</code>)
          </span>
        )}
        <span data-state-label className="text-muted" style={{ marginLeft: 'auto' }}>
          {finding.state}
        </span>
      </p>
      <p className="m-0 font-medium">{finding.claim}</p>
      <p className="m-0 whitespace-pre-wrap text-muted">{finding.evidence}</p>
      <p className="m-0 whitespace-pre-wrap" data-planner-response>
        {finding.answer ? (
          <>
            Planner:{' '}
            {finding.answer.action === 'fixed' && finding.answer.revisionHash ? (
              <>
                Fixed in{' '}
                <button type="button" className="underline" data-fixed-revision onClick={() => props.onRevision(finding.answer!.revisionHash!)}>
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
        <ul className="m-0 flex flex-col gap-0.5 pl-0 text-xs text-muted" data-finding-history style={{ display: 'flex', flexDirection: 'column', gap: 2, listStyle: 'none' }}>
          {finding.decisions.map((d, i) => (
            <li key={i}>
              {ACTION_TEXT[d.action]} by {d.by} at <code>{shortHash(d.revisionHash)}</code>
              {d.note ? ` · ${d.note}` : ''}
            </li>
          ))}
        </ul>
      )}
      {asking ? (
        <div className="flex flex-col gap-1" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="text-xs">
            {asking === 'reject' ? 'Reason (required)' : 'Note (optional)'}
            <textarea
              data-finding-note
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-0.5 w-full rounded border p-1 text-sm"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <div className="flex flex-wrap gap-1.5" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <SmallBtn
              primary
              disabled={props.busy || (asking === 'reject' && !note.trim())}
              onClick={() => void send(asking, note.trim())}
              attrs={{ 'data-finding-confirm': asking }}
            >
              {asking === 'reject' ? 'Reject' : 'Defer'}
            </SmallBtn>
            <SmallBtn disabled={props.busy} onClick={() => setAsking(null)}>
              Cancel
            </SmallBtn>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-finding-actions>
          {decided ? (
            <SmallBtn disabled={props.busy} onClick={() => void send('reopen')} attrs={{ 'data-finding-action': 'reopen' }}>
              Reopen
            </SmallBtn>
          ) : (
            <>
              <SmallBtn disabled={props.busy} onClick={() => void send('accept')} attrs={{ 'data-finding-action': 'accept' }}>
                Accept
              </SmallBtn>
              <SmallBtn disabled={props.busy} onClick={() => setAsking('reject')} attrs={{ 'data-finding-action': 'reject' }}>
                Reject
              </SmallBtn>
              <SmallBtn disabled={props.busy} onClick={() => setAsking('defer')} attrs={{ 'data-finding-action': 'defer' }}>
                Defer
              </SmallBtn>
              <SmallBtn disabled={props.busy} onClick={() => void send('resolve')} attrs={{ 'data-finding-action': 'resolve' }}>
                Resolve
              </SmallBtn>
            </>
          )}
        </div>
      )}
    </article>
  )
}

export function ReviewView(props: { workspaceId: string; client: ReviewClient; place: ReviewPlace; onPlace: (place: ReviewPlace) => void; onClose: () => void }) {
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
  const file = place.file && files.includes(place.file) ? place.file : (files[0] ?? null)
  const counts = chipCounts(data?.findings ?? [], place)
  const shown = filterFindings(data?.findings ?? [], place)
  const inFile = shown.filter((f) => f.anchor.file === file)
  const moved = inFile.filter((f) => f.anchor.moved)
  const placed = inFile.filter((f) => !f.anchor.moved)
  const text = file && data ? data.files[file] : ''

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
  useEffect(() => setSelected(null), [file])

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
        <SmallBtn onClick={props.onClose} attrs={{ 'data-review-close': true }}>
          Back to spec
        </SmallBtn>
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
          <div role="tablist" aria-label="Spec files" className="flex flex-wrap gap-1.5" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-review-tabs>
            {files.map((name) => {
              const n = shown.filter((f) => f.anchor.file === name).length
              return (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={name === file}
                  data-review-tab={name}
                  onClick={() => set({ file: name })}
                  className="text-sm"
                  style={{
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: name === file ? 'var(--bg-hover)' : 'transparent',
                    color: 'var(--text)',
                    fontWeight: name === file ? 600 : 400,
                  }}
                >
                  {TAB_LABEL[name] ?? name}
                  {n > 0 && (
                    <span className="text-xs text-muted" style={{ marginLeft: 6 }}>
                      {n}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-1.5" style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-review-filters>
            <div className="flex flex-wrap items-center gap-1.5" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }} data-severity-filters>
              <span className="text-xs text-muted" style={{ width: 52 }}>
                Severity
              </span>
              <Chip label="All" on={!place.severity} onClick={() => set({ severity: null })} attr={{ 'data-severity-filter': 'all' }} />
              {SEVERITIES.map((s) => (
                <Chip
                  key={s}
                  label={SEVERITY_LABEL[s]}
                  count={counts.severity[s] ?? 0}
                  on={place.severity === s}
                  onClick={() => set({ severity: place.severity === s ? null : s })}
                  attr={{ 'data-severity-filter': s }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }} data-state-filters>
              <span className="text-xs text-muted" style={{ width: 52 }}>
                State
              </span>
              <Chip label="All" on={!place.state} onClick={() => set({ state: null })} attr={{ 'data-state-filter': 'all' }} />
              {STATES.filter((s) => counts.state[s] || place.state === s).map((s) => (
                <Chip
                  key={s}
                  label={s}
                  count={counts.state[s] ?? 0}
                  on={place.state === s}
                  onClick={() => set({ state: place.state === s ? null : s })}
                  attr={{ 'data-state-filter': s }}
                />
              ))}
            </div>
          </div>
          <style>{HIT_STYLE}</style>
          <div ref={row} data-review-layout={wide ? 'rail' : 'inline'} style={{ display: 'flex', alignItems: 'flex-start', gap: 20, minWidth: 0 }}>
            <section
              role="tabpanel"
              aria-label={file ? (TAB_LABEL[file] ?? file) : 'No file'}
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
        </>
      )}
    </div>
  )
}

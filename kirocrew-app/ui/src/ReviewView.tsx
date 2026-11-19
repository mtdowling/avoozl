// The spec page's Review view (R104.9-R104.11, design §4.33): the spec files
// at one revision as tabs, a rail of finding cards with severity borders,
// severity and state filters with counts, the person's actions, and links to
// the review and planner chats. It reads plan.review.view and writes only a
// person's decision (plan.review.finding.decide).
// Each card sits level with its anchor's first block; cards that would
// overlap stack in line order. A card click scrolls to and highlights its
// lines; a click on highlighted text selects its card. Moved or removed
// findings list first. A narrow view puts each card after its block.
import { Tabs } from './ui/Tabs.tsx'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Markdown } from './ui/Markdown.tsx'
import { SmallBtn } from './ui/controls.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { CircleAlert, Info, MessageSquare } from './icons.ts'
import { usePhone } from './list-detail.ts'
import { ResizeHandle } from './ResizeHandle.tsx'
import { SIDE, clampWidth, pageStorage, readWidth, writeWidth } from './columns.ts'
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
  blocksIn,
  chipCounts,
  filterFindings,
  lineText,
  openCounts,
  renderText,
  type ChatLink,
  type FindingAction,
  type FindingSeverity,
  type ReviewClient,
  type ReviewFinding,
  type ReviewPlace,
  type ReviewViewData,
} from './review-view.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'
import { REVIEW_ACCENT, ReviewCss } from './ui/PageStyles'
import { PlainButton, PlainLink, PlainTextarea } from './ui/Plain'
import { TONE } from './ui/tones.ts'
import { Glyph } from './ui/Glyph'

const PROSE = '72ch'
// Below this width the text and the rail do not fit side by side.
const WIDE = 720
// The text never gets narrower than this when the side column is dragged wider.
const MIN_TEXT = 320
const SEVERITY_ORDER: Record<string, number> = { blocker: 0, warn: 1, info: 2 }
// Smooth unless the person asked for less motion: then a jump.
const motion = (): ScrollBehavior => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
const lineOf = (el: Element) => Number(el.getAttribute('data-source-line'))

function Chat(props: { label: string; link: ChatLink | null; attr: string }) {
  if (!props.link) return null
  const href = linkHref(props.link.href)
  return href ? (
    <PlainLink href={linkHref(props.link.href)} size="xs" underline {...{ [props.attr]: 'open' }}>
      {props.label}
    </PlainLink>
  ) : (
    <Hint size="xs" {...{ [props.attr]: 'closed' }}>
      {props.label.replace(/^Open (\w)/, (_, c: string) => c.toUpperCase())}: Chat closed
    </Hint>
  )
}

function Chip(props: { label: string; count?: number; on: boolean; onClick: () => void; attr: Record<string, string> }) {
  return (
    <SmallBtn primary={props.on} onClick={props.onClick} attrs={{ 'aria-pressed': props.on ? 'true' : 'false', ...props.attr }}>
      {props.label}
      {props.count !== undefined && (
        <Box as="span" css-margin-left="4" css-opacity="0.8">
          {props.count}
        </Box>
      )}
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

const SEVERITY_ICON: Record<FindingSeverity, typeof Info> = { blocker: CircleAlert, warn: MessageSquare, info: Info }

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
    <Box
      data-finding-card={finding.id}
      data-severity={finding.severity}
      data-finding-state={finding.state}
      data-selected={props.selected ? 'true' : undefined}
      ref={props.cardRef}
      onClick={select}
      as="article"
      css-box-shadow={props.selected ? `0 0 0 2px color-mix(in srgb, ${REVIEW_ACCENT} 55%, transparent)` : undefined}
      css-cursor={props.onSelect ? 'pointer' : undefined}
      css-display="flex"
      css-flex-direction="column"
      css-gap="4"
      css-min-width="0"
      css-border={`1.5px solid ${SEVERITY_COLOR[finding.severity]}`}
      css-border-radius="12"
      css-padding="10px-12px"
      css-background="card-bg"
      css-color="text"
      css-overflow-wrap="anywhere"
      css-box-sizing="border-box"
      size="sm"
    >
      <Box css-display="flex" css-align-items="center" css-gap="8" css-min-width="0">
        <Glyph icon={Icon} size={14} aria-hidden="true" css-flex="none" css-color={ink} />
        <Box css-flex="1-1-auto" css-min-width="0">
          <Tooltip text={finding.statement} display="block">
            <Box
              data-finding-title
              as="h4"
              css-flex="1-1-auto"
              css-min-width="0"
              css-margin="0"
              css-font-size="13"
              css-font-weight="600"
              css-overflow="hidden"
              css-text-overflow="ellipsis"
              css-white-space="nowrap"
              m0
            >
              {finding.statement}
            </Box>
          </Tooltip>
        </Box>
        <Hint data-state-label as="span" css-flex="none" size="11">
          {finding.state}
        </Hint>
      </Box>
      <Box css-padding-left="22" css-display="flex" css-flex-direction="column" css-gap="4" css-min-width="0">
        <Box as="p" css-margin="0" css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="2px-8px" css-font-size="11" m0>
          <Box data-severity-label as="span" css-font-weight="600" css-color={ink}>
            {SEVERITY_LABEL[finding.severity]}
          </Box>
          <Hint>{finding.category}</Hint>
          <Hint as="code" data-finding-lines={props.showFile ? 'file' : undefined}>
            {lineText(finding.anchor)}
          </Hint>
          {finding.anchor.moved && (
            <Hint data-moved>
              Moved or removed (from <code>{shortHash(finding.anchor.revisionHash)}</code>)
            </Hint>
          )}
        </Box>
        <Box
          data-finding-body
          data-clamp={open ? undefined : 'true'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          as="p"
          css-margin="0"
          css-font-size="12"
          css-color="mix-text-85%-transparent"
          css-cursor="pointer"
          css-white-space="pre-wrap"
          m0
          whitespace="pre-wrap"
        >
          {finding.evidence}
        </Box>
        <Box as="p" css-margin="0" css-font-size="12" css-white-space="pre-wrap" m0 data-planner-response>
          {finding.answer ? (
            <>
              Planner:{' '}
              {finding.answer.action === 'fixed' && finding.answer.revisionHash ? (
                <>
                  Fixed in{' '}
                  <PlainButton
                    type="button"
                    css-background="none"
                    css-border="0"
                    css-padding="0"
                    css-color="inherit"
                    css-cursor="pointer"
                    css-font="inherit"
                    underline
                    data-fixed-revision
                    onClick={() => props.onRevision(finding.answer!.revisionHash!)}
                  >
                    <code>{shortHash(finding.answer.revisionHash)}</code>
                  </PlainButton>
                  .
                </>
              ) : (
                'Answered.'
              )}{' '}
              {finding.answer.text}
            </>
          ) : (
            <Hint>Planner has not answered.</Hint>
          )}
        </Box>
        {finding.decisions.length > 0 && (
          <Hint as="ul" css-margin="0" css-padding="0" css-display="flex" css-flex-direction="column" css-gap="2" css-list-style="none" size="11" m0 data-finding-history>
            {finding.decisions.map((d, i) => (
              <li key={i}>
                {ACTION_TEXT[d.action]} by {d.by} at <code>{shortHash(d.revisionHash)}</code>
                {d.note ? ` · ${d.note}` : ''}
              </li>
            ))}
          </Hint>
        )}
        {asking ? (
          <Box css-display="flex" css-flex-direction="column" css-gap="4" css-margin-top="2">
            <Box as="label" css-font-size="12">
              {asking === 'reject' ? 'Reason (required)' : 'Note (optional)'}
              <PlainTextarea
                data-finding-note
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                css-border-color="border"
                css-background="bg"
                css-color="text"
                css-box-sizing="border-box"
                css-width="100%"
                css-border-radius="6"
                css-margin-top="2"
                mt="0.5"
                wFull
                rounded="base"
                border="all"
                p="1"
                size="sm"
              />
            </Box>
            <Box css-display="flex" css-flex-wrap="wrap" css-gap="6">
              <CardBtn main disabled={props.busy || (asking === 'reject' && !note.trim())} onClick={() => void send(asking, note.trim())} attr={{ 'data-finding-confirm': asking }}>
                {asking === 'reject' ? 'Reject' : 'Defer'}
              </CardBtn>
              <CardBtn disabled={props.busy} onClick={() => setAsking(null)} attr={{ 'data-finding-cancel': '' }}>
                Cancel
              </CardBtn>
            </Box>
          </Box>
        ) : (
          <Box css-display="flex" css-flex-direction="column" css-gap="4" css-margin-top="2">
            <Box css-display="flex" css-flex-wrap="wrap" css-gap="6" data-finding-actions>
              {[actions.main, ...actions.rest].map((action) => (
                <CardBtn key={action} main={action === actions.main} disabled={props.busy} onClick={() => act(action)} attr={{ 'data-finding-action': action }}>
                  {ACTION_LABEL[action]}
                </CardBtn>
              ))}
            </Box>
            <Hint as="p" css-margin="0" size="11" m0 data-finding-hint>
              {actions.hint}
            </Hint>
          </Box>
        )}
      </Box>
    </Box>
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
  const bar = props.bar ?? { label: 'Spec files', attr: 'data-review-tab', prefix: 'review-tab' }
  const count = (n: number) => (
    <Box
      data-tab-count={n}
      aria-label={`${n} open`}
      as="span"
      css-min-width="18"
      css-padding="0-6px"
      css-border-radius="999"
      css-font-size="11"
      css-line-height="18px"
      css-text-align="center"
      css-font-family="inherit"
      css-font-variant-numeric="tabular-nums"
      css-background={n ? 'bg-hover' : 'transparent'}
      css-color={n ? 'text' : 'muted'}
      css-opacity={n ? '1' : '0.6'}
    >
      {n}
    </Box>
  )
  return (
    <Tabs
      id={bar.prefix}
      label={bar.label}
      barAttr={`${bar.attr}s`}
      tabAttr={bar.attr}
      current={props.current}
      onPick={props.onPick}
      tabs={props.tabs.map((tab) => ({
        key: tab,
        label: bar.labels?.[tab] ?? TAB_LABEL[tab] ?? tab,
        badge: !props.bar || props.counts[tab] !== undefined ? count(props.counts[tab] ?? 0) : undefined,
      }))}
    />
  )
}

export function ReviewView(props: { workspaceId: string; client: ReviewClient; place: ReviewPlace; onPlace: (place: ReviewPlace) => void; fill?: boolean }) {
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

  // The side column beside the text (below it on a phone): Contents, from
  // the document's headings, and Comments, the findings for this file.
  const row = useRef<HTMLDivElement>(null)
  const doc = useRef<HTMLDivElement>(null)
  const cardEls = useRef(new Map<string, HTMLElement>())
  const [wide, setWide] = useState(!phone)
  const [side, setSide] = useState<'contents' | 'comments'>('comments')
  // The side column's width, kept in this browser; the text keeps at least
  // MIN_TEXT of the row.
  const [sideWidth, setSideWidth] = useState(() => readWidth(pageStorage(), SIDE))
  const [rowWidth, setRowWidth] = useState(0)
  const sideMax = Math.max(SIDE.min, Math.min(SIDE.max, rowWidth ? rowWidth - MIN_TEXT : SIDE.max))
  const shownSide = Math.min(sideWidth, sideMax)
  const resizeSide = useCallback(
    (next: number) => {
      const value = clampWidth({ ...SIDE, max: sideMax }, next)
      setSideWidth(value)
      writeWidth(pageStorage(), SIDE, value)
    },
    [sideMax],
  )
  const sideEl = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const scrollTo = useRef<'text' | 'card' | null>(null)
  const blockEls = () => [...(doc.current?.querySelectorAll('[data-source-line]') ?? [])].sort((a, b) => lineOf(a) - lineOf(b)) as HTMLElement[]
  const placedKey = placed.map((f) => `${f.id}:${f.severity}:${f.anchor.lineStart}-${f.anchor.lineEnd}`).join(' ')
  useEffect(() => {
    const measure = () => {
      const width = row.current?.clientWidth ?? 0
      setRowWidth(width)
      if (width) setWide(width >= WIDE)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (row.current) observer.observe(row.current)
    return () => observer.disconnect()
  }, [data, tab])
  // The document's headings, in order, and the one the reader is in.
  const [toc, setToc] = useState<{ id: number; level: number; text: string }[]>([])
  const [current, setCurrent] = useState<number | null>(null)
  const chosen = useRef<number | null>(null)
  const headingEls = () => [...(doc.current?.querySelectorAll('[role="heading"]') ?? [])] as HTMLElement[]
  useEffect(() => {
    const found = headingEls().map((el, id) => ({ id, level: Number(el.getAttribute('aria-level')) || 1, text: el.textContent?.trim() ?? '' }))
    setToc((before) => (JSON.stringify(before) === JSON.stringify(found) ? before : found))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, data])
  useEffect(() => {
    // The page's pane scrolls, not the window: listen in the capture phase.
    const onScroll = (event?: Event) => {
      const els = headingEls()
      // A heading picked in Contents stays marked while it is on screen and
      // the pane could not scroll it any higher (the last headings of a
      // short tail never reach the top).
      const picked = chosen.current
      const top = picked === null ? null : els[picked]?.getBoundingClientRect().top
      const pane = event?.target instanceof Element ? event.target : document.scrollingElement
      const atEnd = Boolean(pane && pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1)
      if (picked !== null && top != null && top >= 0 && top < innerHeight && (top <= 96 || atEnd)) {
        setCurrent(picked)
        return
      }
      chosen.current = null
      let at: number | null = null
      for (let i = 0; i < els.length; i++) if (els[i].getBoundingClientRect().top <= 96) at = i
      setCurrent(at ?? (els.length ? 0 : null))
    }
    onScroll()
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toc])
  const goHeading = (id: number) => {
    chosen.current = id
    headingEls()[id]?.scrollIntoView({ block: 'start', behavior: motion() })
    setCurrent(id)
  }
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

  // Each anchored block is tinted by its worst finding's severity and takes
  // focus; the selected finding's blocks are stronger. A text click or Enter
  // opens Comments and brings the card into view; a card click scrolls to
  // the text.
  useEffect(() => {
    const els = blockEls(),
      lines = els.map(lineOf)
    const byBlock = new Map<number, ReviewFinding[]>()
    for (const f of placed) for (const at of blocksIn(lines, f.anchor.lineStart, f.anchor.lineEnd)) byBlock.set(at, [...(byBlock.get(at) ?? []), f])
    // Only blocks that lose their tint lose tabindex: taking it from a
    // focused block, even for a moment, drops the focus.
    els.forEach((el, at) => {
      el.removeAttribute('data-review-hit')
      if (byBlock.has(at)) return
      for (const name of ['data-review-anchor', 'data-review-sev', 'tabindex', 'aria-label']) el.removeAttribute(name)
      // A heading keeps its own role; any other block is a button while tinted.
      if (el.hasAttribute('data-review-role')) el.removeAttribute('role')
      el.removeAttribute('data-review-role')
    })
    for (const [at, list] of byBlock) {
      const worst = [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0]
      els[at].setAttribute('data-review-anchor', worst.id)
      els[at].setAttribute('data-review-sev', worst.severity)
      els[at].setAttribute('tabindex', '0')
      if (!els[at].hasAttribute('role')) {
        els[at].setAttribute('role', 'button')
        els[at].setAttribute('data-review-role', '')
      }
      els[at].setAttribute('aria-label', `${list.length} review ${list.length === 1 ? 'comment' : 'comments'} on this text. Open ${worst.statement}`)
    }
    const finding = placed.find((f) => f.id === selected)
    if (!finding) return
    const hit = blocksIn(lines, finding.anchor.lineStart, finding.anchor.lineEnd).map((i) => els[i])
    for (const el of hit) el.setAttribute('data-review-hit', 'true')
    if (scrollTo.current === 'text') hit[0]?.scrollIntoView({ block: 'center', behavior: motion() })
    if (scrollTo.current === 'card') cardEls.current.get(finding.id)?.scrollIntoView({ block: 'nearest', behavior: motion() })
    scrollTo.current = null
  })
  const pick = (id: string) => {
    scrollTo.current = 'text'
    setSelected(id)
  }
  // The block a click or key reached, and the finding it opens: the one the
  // block is tinted for.
  const openAnchor = (target: EventTarget) => {
    const el = (target as Element).closest?.('[data-review-anchor]')
    if (!el || (target as Element).closest('a, button')) return false
    const id = el.getAttribute('data-review-anchor')
    if (!id || !placed.some((f) => f.id === id)) return false
    scrollTo.current = 'card'
    setSide('comments')
    setSelected(id)
    return true
  }
  const card = (finding: ReviewFinding) => (
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
      onDecide={(action, note) => decide(finding, action, note)}
      onRevision={(hash) => set({ rev: hash })}
    />
  )
  const movedGroup = moved.length > 0 && (
    <Box data-moved-group css-display="flex" css-flex-direction="column" css-gap="8" flex flexCol gap="2">
      <Hint as="h4" css-text-transform="uppercase" css-letter-spacing="0.05em" m0 size="xs" weight="medium">
        Moved or removed
      </Hint>
      {moved.map((f) => card(f))}
    </Box>
  )
  return (
    <Box
      data-review-view={place.plan}
      css-display="flex"
      css-flex-direction="column"
      css-min-width="0"
      css-gap="16"
      css-padding={phone ? '16px-0' : '16px-12px'}
      css-flex={props.fill ? '1-1-0%' : undefined}
      css-min-height={props.fill ? '0' : undefined}
      flex
      minW0
      flexCol
    >
      <Box css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="8" flex flexWrap items="center" gap="2">
        <Box as="h3" css-flex="1-1-auto" m0 size="base" weight="semibold">
          Review
          {data && (
            <Hint as="span" css-margin-left="8" size="sm" weight="normal">
              at{' '}
              <Tooltip text={data.revisionHash}>
                <code data-review-revision>{shortHash(data.revisionHash)}</code>
              </Tooltip>
              {!data.current && ' · older revision'}
            </Hint>
          )}
        </Box>
        {data && !data.current && (
          <SmallBtn onClick={() => set({ rev: null })} attrs={{ 'data-review-current': true }}>
            Show current revision
          </SmallBtn>
        )}
      </Box>
      {error && (
        <ErrorText role="alert" size="sm" flush>
          {error}
        </ErrorText>
      )}
      {!data ? (
        !error && (
          <Hint as="p" size="sm" flush>
            Loading…
          </Hint>
        )
      ) : (
        <>
          <Box css-display="flex" css-flex-direction="column" css-gap="4" flex flexCol gap="1" data-review-rounds>
            {data.rounds.length === 0 && (
              <Hint as="p" size="sm" flush>
                Not reviewed yet.
              </Hint>
            )}
            {data.rounds.map((round) => (
              <Box
                key={round.id}
                data-review-round={round.id}
                css-display="flex"
                css-flex-wrap="wrap"
                css-align-items="baseline"
                css-gap="4px-12px"
                flex
                flexWrap
                items="baseline"
                gapX="3"
                gapY="1"
                size="sm"
              >
                <Box as="span" weight="medium">
                  Round {round.round}
                  {data.rounds.some((r) => r.pass !== round.pass) ? ` of pass ${round.pass}` : ''}
                </Box>
                <Hint>
                  {round.state} · {round.reviewerModel ?? 'reviewer not set'} at <code>{shortHash(round.revisionHash)}</code>
                </Hint>
                <Chat label="Open review chat" link={round.reviewChat} attr="data-review-chat" />
                <Chat label="Open planner chat" link={round.plannerChat} attr="data-planner-chat" />
              </Box>
            ))}
          </Box>
          {tab && <DocTabs tabs={tabs} current={tab} counts={{ ...open.byFile, [ALL_TAB]: open.total }} onPick={(name) => set({ file: name })} />}
          <Box css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="6" flex flexWrap items="center" gap="1.5" data-review-filters>
            <Box
              as="span"
              css-display="flex"
              css-flex-wrap="wrap"
              css-align-items="center"
              css-gap="6"
              flex
              flexWrap
              items="center"
              gap="1.5"
              role="group"
              aria-label="Severity"
              data-severity-filters
            >
              <Hint size="xs">Severity</Hint>
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
            </Box>
            <Box
              as="span"
              css-display="flex"
              css-flex-wrap="wrap"
              css-align-items="center"
              css-gap="6"
              css-margin-left={phone ? '0' : '12'}
              flex
              flexWrap
              items="center"
              gap="1.5"
              role="group"
              aria-label="State"
              data-state-filters
            >
              <Hint size="xs">State</Hint>
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
            </Box>
          </Box>
          <ReviewCss />
          {all ? (
            <Box
              role="tabpanel"
              id="review-tab-panel"
              aria-labelledby="review-tab-all"
              data-review-all
              as="section"
              css-display="flex"
              css-flex-direction="column"
              css-gap="8"
              css-min-width="0"
              css-max-width="760"
              css-flex={props.fill ? '1-1-0%' : undefined}
              css-min-height={props.fill ? '0' : undefined}
              css-overflow-y={props.fill ? 'auto' : undefined}
            >
              {shown.length === 0 && (
                <Hint as="p" size="sm" flush data-review-empty>
                  {data.findings.length === 0 ? 'No findings.' : 'No finding matches these filters.'}
                </Hint>
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
            </Box>
          ) : (
            <Box
              ref={row}
              data-review-layout={wide ? 'rail' : 'inline'}
              css-display="flex"
              css-flex-direction={wide ? 'row' : 'column'}
              css-align-items={props.fill && wide ? 'stretch' : wide ? 'flex-start' : 'stretch'}
              css-gap={wide ? '6' : '20'}
              css-min-width="0"
              css-flex={props.fill ? '1-1-0%' : undefined}
              css-min-height={props.fill ? '0' : undefined}
              css-overflow-y={props.fill ? (wide ? 'hidden' : 'auto') : undefined}
            >
              <Box
                role="tabpanel"
                id="review-tab-panel"
                aria-labelledby={file ? `review-tab-${file.replace(/\W/g, '-')}` : undefined}
                aria-label={file ? undefined : 'No file'}
                data-review-doc={file ?? ''}
                as="section"
                css-flex="1-1-0"
                css-min-width="0"
                css-width={wide ? undefined : '100%'}
                css-box-sizing="border-box"
                css-border="1px-solid-border"
                css-border-radius="12"
                css-padding="12px-14px"
                css-background="card-bg"
                css-min-height={props.fill && wide ? '0' : undefined}
                css-overflow-y={props.fill && wide ? 'auto' : undefined}
                minW0
              >
                <div
                  ref={doc}
                  onClick={(event) => openAnchor(event.target)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.target !== (event.target as Element).closest('[data-review-anchor]')) return
                    if (openAnchor(event.target)) event.preventDefault()
                  }}
                >
                  {file ? (
                    <Markdown text={text} measure={PROSE} />
                  ) : (
                    <Hint as="p" size="sm" flush>
                      This revision has no spec files.
                    </Hint>
                  )}
                </div>
              </Box>
              {wide && (
                <ResizeHandle
                  label="Resize the side column"
                  width={shownSide}
                  min={SIDE.min}
                  max={sideMax}
                  left={() => sideEl.current?.getBoundingClientRect().right ?? 0}
                  growsLeft
                  onResize={resizeSide}
                  onReset={() => resizeSide(SIDE.initial)}
                />
              )}
              <Box
                as="aside"
                ref={sideEl}
                aria-label="Side column"
                data-review-rail
                flex
                minW0
                flexCol
                gap="2"
                css-display="flex"
                css-flex-direction="column"
                css-gap={8}
                css-min-width={0}
                css-flex={wide ? `0 0 ${shownSide}px` : 'none'}
                css-width={wide ? shownSide : '100%'}
                css-min-height={wide && props.fill ? 0 : undefined}
                css-position={wide && !props.fill ? 'sticky' : undefined}
                css-top={wide && !props.fill ? 8 : undefined}
                css-max-height={wide && !props.fill ? 'calc(100vh - 16px)' : undefined}
                css-overflow-y={wide ? 'auto' : undefined}
              >
                <DocTabs
                  tabs={['contents', 'comments']}
                  current={side}
                  counts={{ comments: inFile.length }}
                  onPick={(next) => setSide(next as 'contents' | 'comments')}
                  bar={{ label: 'Side column', attr: 'data-review-side-tab', prefix: 'review-side', labels: { contents: 'Contents', comments: 'Comments' } }}
                />
                {side === 'contents' ? (
                  <Box
                    id="review-side-panel"
                    role="tabpanel"
                    aria-labelledby="review-side-contents"
                    aria-label="Contents"
                    data-review-contents
                    as="nav"
                    css-display="flex"
                    css-flex-direction="column"
                    css-gap="2"
                    flex
                    flexCol
                  >
                    {toc.length === 0 ? (
                      <Hint as="p" size="sm" flush>
                        This file has no headings.
                      </Hint>
                    ) : (
                      toc.map((h) => (
                        <PlainButton
                          key={h.id}
                          type="button"
                          data-toc-item={h.id}
                          aria-current={current === h.id ? 'location' : undefined}
                          onClick={() => goHeading(h.id)}
                          css-text-align="left"
                          css-border="0"
                          css-background="transparent"
                          css-color="text"
                          css-cursor="pointer"
                          css-font-size="13"
                          css-padding="4px-8px"
                          css-padding-left={8 + (h.level - 1) * 12}
                          css-border-radius="4"
                        >
                          {h.text}
                        </PlainButton>
                      ))
                    )}
                  </Box>
                ) : (
                  <Box
                    id="review-side-panel"
                    role="tabpanel"
                    aria-labelledby="review-side-comments"
                    data-review-comments
                    css-display="flex"
                    css-flex-direction="column"
                    css-gap="8"
                    flex
                    flexCol
                    gap="2"
                  >
                    {movedGroup}
                    {placed.map((f) => card(f))}
                    {inFile.length === 0 && (
                      <Hint as="p" size="sm" flush data-review-empty>
                        {data.findings.length === 0 ? 'No findings.' : 'No finding in this file matches these filters.'}
                      </Hint>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  )
}

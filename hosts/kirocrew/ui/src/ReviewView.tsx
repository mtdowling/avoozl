// The spec page's review comments (R104.9-R104.11, design §4.33), read from
// plan.review.view: on each document's own tab the comments sit inline
// under the text they are on, finding cards with severity borders, with a
// toggle, severity and state filters with counts, and the person's actions;
// the Overview's Review card lists the rounds, their review and planner
// chats, and every comment. It writes only a person's decision
// (plan.review.finding.decide).
import { Tabs } from './ui/Tabs.tsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Markdown } from './ui/Markdown.tsx'
import { SmallBtn } from './ui/controls.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { CircleAlert, Info, MessageSquare } from './icons.ts'
import { pageStorage, readFlag, writeFlag } from './columns.ts'
import { blockLines } from './markdown.ts'
import { shortHash } from './plans-api.ts'
import { linkHref } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import {
  DECIDED,
  SEVERITIES,
  SEVERITY_COLOR,
  SEVERITY_INK,
  SEVERITY_LABEL,
  STATES,
  blocksIn,
  chipCounts,
  filterFindings,
  lineText,
  renderText,
  threadLines,
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
import { FadeText } from './ui/FadeText'
import { REVIEW_ACCENT, ReviewCss } from './ui/PageStyles'
import { PlainButton, PlainLink, PlainTextarea } from './ui/Plain'
import { Glyph } from './ui/Glyph'

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

// The spec page's tab bar (SpecTabs): one tab per view and spec file, a
// file's tab with its open-comment count. Arrow keys, Home and End move
// between tabs (WAI-ARIA tabs).
export function DocTabs(props: {
  tabs: string[]
  current: string
  counts: Record<string, number>
  onPick: (tab: string) => void
  // The bar's accessible name, data attribute and ids, its labels, and its look.
  bar: { label: string; attr: string; prefix: string; labels?: Record<string, string>; look?: 'heading' }
}) {
  const { bar } = props
  return (
    <Tabs
      id={bar.prefix}
      label={bar.label}
      barAttr={`${bar.attr}s`}
      tabAttr={bar.attr}
      look={bar.look}
      current={props.current}
      onPick={props.onPick}
      tabs={props.tabs.map((tab) => ({
        key: tab,
        label: bar.labels?.[tab] ?? tab,
        badge: props.counts[tab] !== undefined ? <Count n={props.counts[tab]} /> : undefined,
      }))}
    />
  )
}

function Count({ n, label = 'open' }: { n: number; label?: string }) {
  return (
    <Box
      data-tab-count={n}
      aria-label={`${n} ${label}`}
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
}

// The open spec's review, read once for the Overview and every document
// tab: plan.review.view at `rev` (none: the current revision), and the
// person's decisions at the revision on screen. `onDecided` lets the page
// read the plan again, since a decision changes its open counts.
export function useReview(client: ReviewClient, workspaceId: string | null, plan: string | null, rev: string | null, version: unknown, onDecided?: () => void) {
  const [data, setData] = useState<ReviewViewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!workspaceId || !plan) return
    try {
      const next = await client.view(workspaceId, plan, rev)
      setData(next.planId === plan ? next : null)
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, workspaceId, plan, rev, version])
  useEffect(() => {
    setData(null)
    setError(null)
  }, [workspaceId, plan])
  useEffect(() => {
    void load()
  }, [load])
  const decide = async (finding: ReviewFinding, action: FindingAction, note?: string) => {
    if (!data || !workspaceId) return false
    setBusy(true)
    setError(null)
    try {
      await client.decide(workspaceId, finding.id, action, data.revisionHash, note)
      await load()
      onDecided?.()
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { data: data?.planId === plan ? data : null, error, busy, decide }
}
export type Review = ReturnType<typeof useReview>

// Whether the inline comments are hidden, kept in this browser for every
// document.
const HIDE_COMMENTS = 'avoozl:review-comments-hidden'

// One spec document with its review comments inline, as a pull request's
// review sits in its diff: each comment thread is a box under the last
// block its anchor touches. Above the text, the comments' toggle with
// their count, the revision when it is not the current one, and the
// severity and state filters; comments whose text moved or went list first.
// Each anchored block is tinted by its worst comment's severity and takes
// focus; a click or Enter on it picks that comment, and a click on a
// comment marks its lines. `text` is the file on disk, shown until (or
// unless) the review has the file at its revision.
export function DocumentComments(props: { review: Review; file: string; text: string; place: ReviewPlace; onPlace: (place: ReviewPlace) => void; measure: string }) {
  const { review, file, place } = props
  const data = review.data
  const [hidden, setHidden] = useState(() => readFlag(pageStorage(), HIDE_COMMENTS))
  const show = (on: boolean) => {
    setHidden(!on)
    writeFlag(pageStorage(), HIDE_COMMENTS, !on)
  }
  const set = (change: Partial<ReviewPlace>) => props.onPlace({ ...place, ...change })
  const ofFile = (data?.findings ?? []).filter((f) => f.anchor.file === file)
  const counts = chipCounts(ofFile, place)
  const shown = filterFindings(ofFile, place)
  const moved = shown.filter((f) => f.anchor.moved)
  const placed = hidden ? [] : shown.filter((f) => !f.anchor.moved)
  const source = renderText(file, typeof data?.files[file] === 'string' ? data.files[file] : props.text)
  const threads = threadLines(blockLines(source), placed)
  const doc = useRef<HTMLDivElement>(null)
  const cardEls = useRef(new Map<string, HTMLElement>())
  const [selected, setSelected] = useState<string | null>(place.finding)
  const scrollTo = useRef<'text' | 'card' | null>(place.finding ? 'card' : null)
  // A comment the address names (from the Overview's list) is picked and shown.
  useEffect(() => {
    if (!place.finding) return
    setSelected(place.finding)
    scrollTo.current = 'card'
    if (hidden) show(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.finding])
  const blockEls = () => [...(doc.current?.querySelectorAll('[data-source-line]') ?? [])].sort((a, b) => lineOf(a) - lineOf(b)) as HTMLElement[]
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
      els[at].setAttribute('aria-label', `${list.length} review ${list.length === 1 ? 'comment' : 'comments'} on this text. Go to ${worst.statement}`)
    }
    const finding = shown.find((f) => f.id === selected)
    const hit = finding && !finding.anchor.moved ? blocksIn(lines, finding.anchor.lineStart, finding.anchor.lineEnd).map((i) => els[i]) : []
    for (const el of hit) el.setAttribute('data-review-hit', 'true')
    if (finding && scrollTo.current === 'text') hit[0]?.scrollIntoView({ block: 'nearest', behavior: motion() })
    if (finding && scrollTo.current === 'card') cardEls.current.get(finding.id)?.scrollIntoView({ block: 'nearest', behavior: motion() })
    if (finding) scrollTo.current = null
  })
  // The block a click or key reached, and the comment it picks: the one the
  // block is tinted for.
  const openAnchor = (target: EventTarget) => {
    const el = (target as Element).closest?.('[data-review-anchor]')
    if (!el || (target as Element).closest('a, button')) return false
    const id = el.getAttribute('data-review-anchor')
    if (!id || !placed.some((f) => f.id === id)) return false
    scrollTo.current = 'card'
    setSelected(id)
    return true
  }
  const card = (finding: ReviewFinding) => (
    <FindingCard
      key={finding.id}
      finding={finding}
      busy={review.busy}
      selected={selected === finding.id}
      onSelect={
        finding.anchor.moved
          ? undefined
          : () => {
              scrollTo.current = 'text'
              setSelected(finding.id)
            }
      }
      cardRef={(el) => {
        if (el) cardEls.current.set(finding.id, el)
        else cardEls.current.delete(finding.id)
      }}
      onDecide={(action, note) => review.decide(finding, action, note)}
      onRevision={(hash) => set({ rev: hash, finding: null })}
    />
  )
  const thread = (line: number) => {
    const list = threads.get(line)
    return list ? (
      <Box
        data-inline-thread={line}
        as="section"
        aria-label={`Review comments on line ${line}`}
        css-display="flex"
        css-flex-direction="column"
        css-gap="8"
        css-margin="4px-0-12px"
        css-max-width={props.measure}
        css-min-width="0"
      >
        {list.map(card)}
      </Box>
    ) : null
  }
  return (
    <Box data-review-doc={file} css-display="flex" css-flex-direction="column" css-gap="12" css-min-width="0">
      <ReviewCss />
      {review.error && (
        <ErrorText role="alert" size="sm" flush>
          {review.error}
        </ErrorText>
      )}
      {data && (ofFile.length > 0 || !data.current) && (
        <Box data-review-toolbar css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="6" css-padding-bottom="14" css-border-bottom="1px-solid-border">
          {ofFile.length > 0 && (
            <SmallBtn onClick={() => show(hidden)} attrs={{ 'aria-pressed': hidden ? 'false' : 'true', 'data-comments-toggle': hidden ? 'hidden' : 'shown' }}>
              <Glyph icon={MessageSquare} size={13} aria-hidden="true" />
              {hidden ? 'Show comments' : 'Hide comments'}
              <Count n={shown.length} label={shown.length === 1 ? 'comment' : 'comments'} />
            </SmallBtn>
          )}
          {!data.current && (
            <Hint size="xs" data-review-older>
              Showing revision{' '}
              <Tooltip text={data.revisionHash}>
                <code data-review-revision>{shortHash(data.revisionHash)}</code>
              </Tooltip>
              , not the current one.
            </Hint>
          )}
          {!data.current && (
            <SmallBtn onClick={() => set({ rev: null, finding: null })} attrs={{ 'data-review-current': true }}>
              Show current revision
            </SmallBtn>
          )}
          {!hidden && ofFile.length > 0 && <Filters counts={counts} place={place} onPlace={props.onPlace} />}
        </Box>
      )}
      {!hidden && moved.length > 0 && (
        <Box data-moved-group css-display="flex" css-flex-direction="column" css-gap="8" css-max-width={props.measure}>
          <Hint as="h4" css-text-transform="uppercase" css-letter-spacing="0.05em" m0 size="xs" weight="medium">
            Moved or removed
          </Hint>
          {moved.map(card)}
        </Box>
      )}
      {!hidden && data && ofFile.length > 0 && shown.length === 0 && (
        <Hint as="p" size="sm" flush data-review-empty>
          No comment in this file matches these filters.
        </Hint>
      )}
      <div
        ref={doc}
        onClick={(event) => openAnchor(event.target)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.target !== (event.target as Element).closest('[data-review-anchor]')) return
          if (openAnchor(event.target)) event.preventDefault()
        }}
      >
        <Markdown text={source} measure={props.measure} after={hidden ? undefined : thread} />
      </div>
    </Box>
  )
}

// The severity and state toggles, each with the count it would show.
function Filters(props: { counts: ReturnType<typeof chipCounts>; place: ReviewPlace; onPlace: (place: ReviewPlace) => void }) {
  const { counts, place } = props
  const set = (change: Partial<ReviewPlace>) => props.onPlace({ ...place, finding: null, ...change })
  return (
    <Box css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="6" css-margin-left="8" data-review-filters>
      <Box as="span" css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="6" role="group" aria-label="Severity" data-severity-filters>
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
      <Box as="span" css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="6" css-margin-left="8" role="group" aria-label="State" data-state-filters>
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
  )
}

// The Overview's Review card: the review rounds with their chats, and every
// comment in one list, each a link to its line on its document's tab.
// Comments are read and decided there, beside their text.
export function ReviewOverview(props: { review: Review; onOpen: (finding: ReviewFinding) => void; onCurrent: () => void }) {
  const { data, error } = props.review
  if (error)
    return (
      <ErrorText role="alert" size="sm" flush>
        {error}
      </ErrorText>
    )
  if (!data)
    return (
      <Hint as="p" size="sm" flush>
        Loading…
      </Hint>
    )
  return (
    <Box data-review-overview css-display="flex" css-flex-direction="column" css-gap="12" css-min-width="0" size="sm">
      <Box css-display="flex" css-flex-direction="column" css-gap="4" data-review-rounds>
        {data.rounds.length === 0 && (
          <Hint as="p" size="sm" flush>
            Not reviewed yet.
          </Hint>
        )}
        {data.rounds.map((round) => (
          <Box key={round.id} data-review-round={round.id} css-display="flex" css-flex-wrap="wrap" css-align-items="baseline" css-gap="4px-12px">
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
        {!data.current && (
          <Box css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="8">
            <Hint size="xs" data-review-older>
              Showing revision <code data-review-revision>{shortHash(data.revisionHash)}</code>, not the current one.
            </Hint>
            <SmallBtn onClick={props.onCurrent} attrs={{ 'data-review-current': true }}>
              Show current revision
            </SmallBtn>
          </Box>
        )}
      </Box>
      {data.findings.length === 0 ? (
        <Hint as="p" size="sm" flush data-review-empty>
          No comments.
        </Hint>
      ) : (
        <Box
          as="ul"
          data-review-all
          aria-label="Review comments"
          css-display="flex"
          css-flex-direction="column"
          css-margin="0"
          css-padding="0"
          css-list-style="none"
          css-min-width="0"
        >
          {filterFindings(data.findings, { severity: [], state: [] }).map((f) => {
            const Icon = SEVERITY_ICON[f.severity]
            return (
              <Box
                key={f.id}
                as="li"
                data-review-finding={f.id}
                data-severity={f.severity}
                css-display="flex"
                css-align-items="center"
                css-gap="8"
                css-padding="4px-0"
                css-border-top="1px-solid-border"
                css-min-width="0"
              >
                <Glyph icon={Icon} size={13} aria-hidden="true" css-flex="none" css-color={SEVERITY_INK[f.severity]} />
                <Box as="span" css-flex="none" css-font-size="11" css-font-weight="600" css-color={SEVERITY_INK[f.severity]}>
                  {SEVERITY_LABEL[f.severity]}
                </Box>
                <PlainButton type="button" data-finding-open={f.id} onClick={() => props.onOpen(f)} minW0 flex1 overflow="hidden" align="left" hoverUnderline>
                  <FadeText>{f.statement}</FadeText>
                </PlainButton>
                <Hint as="code" css-flex="none" size="xs">
                  {lineText(f.anchor)}
                  {f.anchor.moved ? ' · moved' : ''}
                </Hint>
                <Hint as="span" data-state-label css-flex="none" size="11">
                  {f.state}
                </Hint>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

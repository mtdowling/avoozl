// The Intake tab (design §8.5, §4.12, R49, R50, R52): incoming items from
// GitHub and every declared intake source. Its default filter, Untriaged,
// shows those no trigger rule, triage label or Avoozl task covers. A GitHub
// row hands off to GitHub, Issue Radar or Code Review Sage, which do the
// work; the one GitHub write is Send to Issue Radar (SendToRadar.tsx), which
// adds a crew's label after a confirm step; those issues, and any a crew
// holds, show under With Issue Radar. A row from another source links to its
// item and offers a person Plan this and Deliver this, each asked first.
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { EmptyState, SegmentedControl } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Tooltip } from './Tooltip.tsx'
import { FilterPanel, useStoredFilter } from './FilterPanel.tsx'
import { ICON, IconBtn, IconLabel, ShowMore, ViewHeading, useConfirm, usePages } from './controls.tsx'
import { Check, CircleDot, FileText, GitPullRequest, GitPullRequestDraft, Inbox, MessageSquare, Play, Radar, RefreshCw, ScanSearch, Users, X, type LucideIcon } from './icons.ts'
import { SendToRadar } from './SendToRadar.tsx'
import { useMedia } from './TaskDrawer.tsx'
import { relativeTime } from './task-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { useSteppedState } from './NavHistory.tsx'
import {
  AGE_OPTIONS,
  KIND_OPTIONS,
  UNTRIAGED_FILTER_STORE,
  age,
  authorHref,
  emptyText,
  filterActive,
  filterOptions,
  itemKey,
  itemName,
  matchesFilter,
  radarClient,
  repositoryHref,
  radarState,
  selectionHandOff,
  sendable,
  sourceOf,
  toggleSelected,
  untriagedClient,
  type HandOff,
  type RadarItem,
  type UntriagedFilter,
  type UntriagedItem,
  type UntriagedList,
} from './untriaged-api.ts'
import { linkHref } from './views-api.ts'

const HEAD: CSSProperties = { textAlign: 'left', fontWeight: 500, fontSize: 12, color: 'var(--muted)', padding: '4px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const CELL: CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'top' }
const ROW: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
const LINK_BUTTON: CSSProperties = {
  ...ROW,
  padding: '4px 6px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  background: 'var(--card, transparent)',
}

// A link styled as the page's icon button. Kiro Crew pages open in the
// dashboard itself (target _top); GitHub opens in a new tab.
function IconLink(props: { icon: LucideIcon; label: string; tooltip: string; href: string | undefined; external?: boolean; children?: ReactNode }) {
  const Icon = props.icon
  return (
    <Tooltip text={props.tooltip}>
      {(describedBy) => (
        <a
          href={linkHref(props.href)}
          aria-label={props.label}
          aria-describedby={describedBy}
          {...(props.external ? { target: '_blank', rel: 'noopener noreferrer' } : { target: '_top' })}
          style={LINK_BUTTON}
          className="text-sm"
        >
          <Icon size={ICON} aria-hidden="true" />
          {props.children}
        </a>
      )}
    </Tooltip>
  )
}

function KindIcon({ item }: { item: UntriagedItem }) {
  const Icon = item.kind === 'issue' ? CircleDot : item.kind === 'ticket' ? FileText : item.kind === 'review' ? ScanSearch : item.draft ? GitPullRequestDraft : GitPullRequest
  const name = item.kind === 'issue' ? 'Issue' : item.kind === 'ticket' ? 'Ticket' : item.kind === 'review' ? 'Review request' : item.draft ? 'Draft pull request' : 'Pull request'
  return (
    <Tooltip text={name}>
      <span role="img" aria-label={name} style={{ display: 'inline-flex', color: item.kind === 'issue' || item.kind === 'ticket' ? 'var(--ok)' : 'var(--accent)' }}>
        <Icon size={16} aria-hidden="true" />
      </span>
    </Tooltip>
  )
}

const CHECK_TEXT = { passing: 'Checks pass', failing: 'Checks fail', pending: 'Checks running' } as const

function PullState({ item }: { item: UntriagedItem }) {
  if (item.kind !== 'pr') return null
  const checks = item.checks
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      {item.draft && <Badge>draft</Badge>}
      {checks && (
        <span className="inline-flex items-center gap-1" style={{ color: checks === 'passing' ? 'var(--ok)' : checks === 'failing' ? 'var(--danger)' : 'var(--muted)' }}>
          {checks === 'passing' ? <Check size={12} aria-hidden="true" /> : checks === 'failing' ? <X size={12} aria-hidden="true" /> : null}
          {CHECK_TEXT[checks]}
        </span>
      )}
    </span>
  )
}

function Labels({ labels }: { labels: string[] }) {
  if (!labels.length) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((label) => (
        <Badge key={label}>{label}</Badge>
      ))}
    </span>
  )
}

type Start = (item: UntriagedItem, action: 'deliver' | 'plan') => void

function Actions({ item, onSend, onReview, onStart }: { item: UntriagedItem; onSend?: (item: UntriagedItem) => void; onReview?: (item: UntriagedItem) => void; onStart?: Start }) {
  const name = itemName(item)
  // An item from another source: a person's Plan this and Deliver this, and
  // Code review for a review request. Issue Radar works GitHub only.
  if (sourceOf(item) !== 'github')
    return (
      <span className="inline-flex gap-1.5">
        {item.links.review && <IconLink icon={ScanSearch} label={`Code review for ${name}`} tooltip={item.links.review.tooltip} href={linkHref(item.links.review.url)} />}
        {onStart && item.start?.plan && (
          <IconBtn icon={FileText} label={`Plan this: ${name}`} tooltip="Plan this: a planner turns it into a task in the Inbox." onClick={() => onStart(item, 'plan')} />
        )}
        {onStart && item.start?.deliver && (
          <IconBtn icon={Play} label={`Deliver this: ${name}`} tooltip="Deliver this: one task in its repository, pinned to this text." onClick={() => onStart(item, 'deliver')} />
        )}
      </span>
    )
  return (
    <span className="inline-flex gap-1.5">
      {onSend &&
        (item.kind === 'issue' ? (
          <IconBtn icon={Users} label={`Send ${name} to an Issue Radar crew`} tooltip="Send to an Issue Radar crew: pick a crew, check the label, then Avoozl adds it." onClick={() => onSend(item)} />
        ) : (
          // Crews work issues only; the gap keeps the columns lined up.
          <span aria-hidden="true" style={{ display: 'inline-block', width: 28 }} />
        ))}
      {item.links.issueRadar && <IconLink icon={Radar} label={`Open ${name} in Issue Radar`} tooltip={item.links.issueRadar.tooltip} href={linkHref(item.links.issueRadar.url)} />}
      {item.links.review && onReview && (
        <IconBtn icon={ScanSearch} label={`Code review for ${name}`} tooltip={item.links.review.tooltip} onClick={() => onReview(item)} />
      )}
      {item.reviewChat?.link ? (
        <Tooltip text="Open this pull request's code review chat">
          <a href={linkHref(item.reviewChat.link)} target="_top" className="self-center text-sm underline" aria-label={`Attach to the code review chat for ${name}`} data-review-attach>
            Attach
          </a>
        </Tooltip>
      ) : item.reviewChat?.state === 'queued' ? (
        <Tooltip text="The next tick opens the chat, within a minute.">
          <span className="self-center text-xs text-muted" data-review-queued>
            Starting…
          </span>
        </Tooltip>
      ) : null}
    </span>
  )
}

// The repository and author as links to GitHub, opening in a new tab.
function RepoLink({ item }: { item: UntriagedItem }) {
  return (
    <a href={linkHref(repositoryHref(item))} target="_blank" rel="noopener noreferrer" className="underline" data-repository-link>
      {item.repository}
    </a>
  )
}

function AuthorLink({ item, fallback = '' }: { item: UntriagedItem; fallback?: string }) {
  // An author from another source is a name there, not a GitHub login.
  const href = sourceOf(item) === 'github' ? authorHref(item) : null
  if (!href) return <>{item.author ?? fallback}</>
  return (
    <a href={linkHref(href)} target="_blank" rel="noopener noreferrer" className="underline" data-author-link>
      {item.author}
    </a>
  )
}

function Title({ item }: { item: UntriagedItem }) {
  const github = sourceOf(item) === 'github'
  return (
    <a href={linkHref(item.links.github ?? item.links.item ?? item.url)} target="_blank" rel="noopener noreferrer" className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
      <span className="text-muted tabular-nums">{github ? `#${item.number}` : item.id}</span> <span className="underline">{item.title}</span>
    </a>
  )
}

function Select(props: { item: UntriagedItem; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={props.checked}
      aria-label={`Select ${itemName(props.item)}`}
      onChange={(event) => props.onChange(event.target.checked)}
    />
  )
}

function Table(props: { items: UntriagedItem[]; selected: Set<string>; now: number; onSelect: (keys: string[], on: boolean) => void; onSend: (item: UntriagedItem) => void; onReview: (item: UntriagedItem) => void; onStart: Start }) {
  const keys = props.items.map(itemKey)
  const all = keys.length > 0 && keys.every((key) => props.selected.has(key))
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }} data-untriaged-table>
        <thead>
          <tr>
            <th style={{ ...HEAD, width: 28 }}>
              <input type="checkbox" checked={all} aria-label="Select every row shown" onChange={(event) => props.onSelect(keys, event.target.checked)} />
            </th>
            <th style={{ ...HEAD, width: 28 }}>
              <span className="sr-only">Kind</span>
            </th>
            <th style={HEAD}>Item</th>
            <th style={HEAD}>Source</th>
            <th style={HEAD}>Repository</th>
            <th style={HEAD}>Author</th>
            <th style={HEAD}>Age</th>
            <th style={HEAD}>Labels</th>
            <th style={{ ...HEAD, textAlign: 'right' }}>
              <Tooltip text="Comments">
                <span role="img" aria-label="Comments" style={{ display: 'inline-flex' }}>
                  <MessageSquare size={12} aria-hidden="true" />
                </span>
              </Tooltip>
            </th>
            <th style={HEAD}>
              <span className="sr-only">Open in</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr key={itemKey(item)} data-untriaged-row={itemKey(item)}>
              <td style={CELL}>
                <Select item={item} checked={props.selected.has(itemKey(item))} onChange={(on) => props.onSelect([itemKey(item)], on)} />
              </td>
              <td style={CELL}>
                <KindIcon item={item} />
              </td>
              <td style={{ ...CELL, minWidth: '16rem' }}>
                <Title item={item} />
                <div>
                  <PullState item={item} />
                </div>
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }} data-intake-source>
                {sourceOf(item)}
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                <RepoLink item={item} />
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                <AuthorLink item={item} />
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                <Tooltip text={item.createdAt ? `Opened ${item.createdAt.slice(0, 10)}` : null}>
                  <span className="tabular-nums">{age(item.createdAt, props.now)}</span>
                </Tooltip>
              </td>
              <td style={CELL}>
                <Labels labels={item.labels} />
              </td>
              <td style={{ ...CELL, textAlign: 'right' }} className="tabular-nums">
                {sourceOf(item) === 'github' ? item.comments : ''}
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                <Actions item={item} onSend={props.onSend} onReview={props.onReview} onStart={props.onStart} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Narrow screens: one stacked row per item, same parts.
function Stack(props: { items: UntriagedItem[]; selected: Set<string>; now: number; onSelect: (keys: string[], on: boolean) => void; onSend: (item: UntriagedItem) => void; onReview: (item: UntriagedItem) => void; onStart: Start }) {
  return (
    <ul className="flex flex-col" data-untriaged-stack>
      {props.items.map((item) => (
        <li key={itemKey(item)} className="flex items-start gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }} data-untriaged-row={itemKey(item)}>
          <Select item={item} checked={props.selected.has(itemKey(item))} onChange={(on) => props.onSelect([itemKey(item)], on)} />
          <KindIcon item={item} />
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <Title item={item} />
            <span className="text-xs text-muted">
              {sourceOf(item)} · <RepoLink item={item} /> · <AuthorLink item={item} fallback="unknown" /> · {age(item.createdAt, props.now)}
              {sourceOf(item) === 'github' ? ` · ${item.comments} comment${item.comments === 1 ? '' : 's'}` : ''}
            </span>
            <PullState item={item} />
            <Labels labels={item.labels} />
          </div>
          <Actions item={item} onSend={props.onSend} onReview={props.onReview} onStart={props.onStart} />
        </li>
      ))}
    </ul>
  )
}

// When each repository was last read, and any read error or cut-off.
function Checked({ list, now }: { list: UntriagedList; now: number }) {
  const notes = list.repositories.filter((row) => row.error || row.truncated)
  const sources = (list.sources ?? []).filter((row) => row.id !== 'github')
  const times = list.repositories.map((row) => row.checkedAt).filter((at): at is string => Boolean(at)).sort()
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted" data-untriaged-checked>
      {list.repositories.length > 0 && (
        <span>{times.length ? `Checked ${relativeTime(times[0], now)}` : 'Not checked yet'} · GitHub is read at most every 10 minutes.</span>
      )}
      {sources.map((row) => (
        <span key={row.id} className={row.error ? 'text-danger' : undefined} data-intake-source-state={row.id}>
          {row.id}: {row.error ?? (row.via === 'mcp' ? 'Items arrive through MCP.' : row.checkedAt ? `Read ${relativeTime(row.checkedAt, now)}${row.more ? ', more on the next tick' : ''}.` : 'Read on the next tick.')}
          {row.refused ? ` ${row.refused} item${row.refused === 1 ? '' : 's'} refused.` : ''}
        </span>
      ))}
      {notes.map((row) => (
        <span key={row.repository} className={row.error ? 'text-danger' : undefined}>
          {row.repository}: {row.error ?? `GitHub search returns ${row.read} of the ${row.searched ?? 'more'} items it found. Narrow its Untriaged filter to see the rest.`}
        </span>
      ))}
    </div>
  )
}

// With Issue Radar (R52.6): issues a crew holds or was sent, most urgent
// first. Each row says where it stands and which crew Avoozl sent it to.
function RadarList({ items, now, narrow }: { items: RadarItem[]; now: number; narrow: boolean }) {
  const sentLine = (item: RadarItem) =>
    item.handoff
      ? `Sent${item.handoff.crew ? ` to ${item.handoff.crew.name}` : ''}${item.handoff.label ? ` with ${item.handoff.label}` : ''}${item.handoff.at ? ` ${relativeTime(item.handoff.at, now)}` : ''}`
      : 'A crew found it on its own'
  const State = ({ item }: { item: RadarItem }) => {
    const state = radarState(item)
    return <Badge variant={state.tone}>{state.text}</Badge>
  }
  if (narrow)
    return (
      <ul className="flex flex-col" data-radar-list>
        {items.map((item) => (
          <li key={itemKey(item)} className="flex items-start gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }} data-radar-row={itemKey(item)}>
            <KindIcon item={item} />
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <Title item={item} />
              <span className="text-xs text-muted">
                <RepoLink item={item} /> · {sentLine(item)}
              </span>
              <span>
                <State item={item} />
              </span>
            </div>
            <Actions item={item} />
          </li>
        ))}
      </ul>
    )
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }} data-radar-list>
        <thead>
          <tr>
            <th style={{ ...HEAD, width: 28 }}>
              <span className="sr-only">Kind</span>
            </th>
            <th style={HEAD}>Item</th>
            <th style={HEAD}>Repository</th>
            <th style={HEAD}>State</th>
            <th style={HEAD}>How it got there</th>
            <th style={HEAD}>
              <span className="sr-only">Open in</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={itemKey(item)} data-radar-row={itemKey(item)}>
              <td style={CELL}>
                <KindIcon item={item} />
              </td>
              <td style={{ ...CELL, minWidth: '16rem' }}>
                <Title item={item} />
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                <RepoLink item={item} />
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                <State item={item} />
              </td>
              <td style={CELL} className="text-muted">
                {sentLine(item)}
              </td>
              <td style={{ ...CELL, whiteSpace: 'nowrap' }}>
                <Actions item={item} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function UntriagedView({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const ask = useConfirm()
  const client = useMemo(() => untriagedClient(api), [api])
  const radar = useMemo(() => radarClient(api), [api])
  const [show, setShow] = useSteppedState<'untriaged' | 'radar'>(
    'untriaged-show',
    'inner',
    (previous) => (previous === 'radar' ? 'Back to With Issue Radar' : 'Back to Untriaged'),
    'untriaged',
  )
  const [sending, setSending] = useState<UntriagedItem[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const load = useCallback((id: string) => client.view(id), [client])
  const { value: read, error, busy } = useRead(workspaceId, load)
  const [fresh, setFresh] = useState<UntriagedList | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [filter, setFilter] = useStoredFilter<UntriagedFilter>(workspaceId, UNTRIAGED_FILTER_STORE)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const narrow = useMedia('(max-width: 767px)')
  const now = Date.now()
  const list = fresh ?? read
  const options = useMemo(() => filterOptions(list), [list])
  const shown = useMemo(() => (list?.items ?? []).filter((item) => matchesFilter(item, filter, now)), [list, filter, now])
  const pages = usePages(JSON.stringify(filter))
  const chosen = shown.filter((item) => selected.has(itemKey(item)))
  const bulk: HandOff = selectionHandOff(chosen)
  const bulkSend = sendable(chosen)
  const radarItems = list?.withRadar ?? []
  const reload = async () => {
    if (!workspaceId) return
    try {
      setFresh(await client.view(workspaceId))
      setSelected(new Set())
    } catch (caught) {
      setCheckError(errorMessage(caught))
    }
  }
  // Code review: queue the chat, then show Starting… until the tick opens it.
  const review = async (item: UntriagedItem) => {
    if (!workspaceId) return
    setCheckError(null)
    try {
      const chat = await client.review(workspaceId, item)
      setNote(
        chat.state === 'open'
          ? `${item.repository} #${item.number} already has a code review chat. Use Attach.`
          : `Code review chat for ${item.repository} #${item.number} starts on the next tick${chat.skill ? '' : '. The sage-review skill is not installed, so it reviews without it'}.`,
      )
      await reload()
    } catch (caught) {
      setCheckError(errorMessage(caught))
    }
  }
  // Plan this and Deliver this (R50.15), asked first with the item's name.
  const start = async (item: UntriagedItem, action: 'deliver' | 'plan') => {
    if (!workspaceId) return
    const name = itemName(item)
    const yes = await ask(
      action === 'deliver'
        ? { title: `Deliver ${name}?`, body: `Avoozl makes one task in ${item.repository} from "${item.title}", pinned to its text now, and a worker starts it. Avoozl writes nothing back to ${item.source}.`, action: 'Deliver this' }
        : { title: `Plan ${name}?`, body: `Avoozl adds "${item.title}" to the Inbox for a planner. Nothing starts until a plan is approved.`, action: 'Plan this' },
    )
    if (!yes) return
    setCheckError(null)
    try {
      const made = await client.start(workspaceId, item, action)
      setNote(`${name} is now task ${made.taskId}.`)
      await reload()
    } catch (caught) {
      setCheckError(errorMessage(caught))
    }
  }
  const setField = (change: Partial<UntriagedFilter>) => setFilter({ ...filter, ...change })
  const onSelect = (keys: string[], on: boolean) => setSelected(toggleSelected(selected, keys, on))
  const checkNow = async () => {
    if (!workspaceId) return
    setChecking(true)
    setCheckError(null)
    try {
      setFresh(await client.refresh(workspaceId))
    } catch (caught) {
      setCheckError(errorMessage(caught))
    } finally {
      setChecking(false)
    }
  }

  return (
    <section aria-labelledby="avoozl-untriaged-title" className="flex flex-col gap-3.5">
      <ViewHeading
        id="avoozl-untriaged-title"
        view="untriaged"
        actions={
          <IconLabel icon={RefreshCw} onClick={() => void checkNow()} disabled={busy || checking || !list?.enabled} tooltip="Read GitHub and poll each plugin source now instead of waiting for the next check">
            {checking ? 'Checking…' : 'Check now'}
          </IconLabel>
        }
      >
        Intake
      </ViewHeading>
      <p className="text-sm text-muted">
        Work that comes in from GitHub and your intake sources. Untriaged shows the items no trigger rule, triage label or Avoozl task covers. Send GitHub issues to an Issue Radar crew or start a code review chat on a pull request; plan or deliver an item from another source.
      </p>
      {list?.enabled && (
        <div>
        <SegmentedControl
          layoutId="avoozl-untriaged-show"
          ariaLabel="Show"
          segments={[
            { key: 'untriaged', label: `Untriaged (${list.items.length})` },
            ...(list.mode ? [{ key: 'radar' as const, label: `With Issue Radar (${radarItems.length})` }] : []),
          ]}
          value={show}
          onChange={(key: 'untriaged' | 'radar') => setShow(key)}
        />
        </div>
      )}
      {note && (
        <p role="status" className="text-sm text-muted" data-radar-note>
          {note}
        </p>
      )}
      {(error || checkError) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? checkError}
        </p>
      )}
      {!list ? (
        <p className="text-sm text-muted">{busy ? 'Loading…' : 'Not loaded'}</p>
      ) : !list.enabled ? (
        <p className="text-sm text-muted">Intake needs a GitHub mode or an intake source. Choose a mode in Settings › GitHub, or add a source in Settings › Plugins.</p>
      ) : show === 'radar' ? (
        <div className="flex flex-col gap-2" data-radar-view>
          <p className="text-xs text-muted">
            Issues a crew holds, or that you sent to one. Crews act with your GitHub login, so Avoozl tells their work apart by label: a close on an issue a crew claimed counts only once its pull request merges, a crew’s
            labels never start Avoozl rules, and a crew’s “needs human” label shows under Needs you.
          </p>
          {radarItems.length === 0 ? (
            <EmptyState icon={<Radar size={36} aria-hidden="true" />} title="Nothing with Issue Radar" subtitle="Select issues under Untriaged and press Send to Issue Radar." />
          ) : (
            <RadarList items={radarItems} now={now} narrow={narrow} />
          )}
        </div>
      ) : list.items.length === 0 ? (
        <>
          <Checked list={list} now={now} />
          <EmptyState icon={<Inbox size={36} aria-hidden="true" />} {...emptyText(list)} />
        </>
      ) : (
        <>
          <FilterPanel
            id="avoozl-untriaged"
            label="Filter untriaged items"
            active={filterActive(filter)}
            onClear={() => setFilter({})}
            fields={[
              { kind: 'select', key: 'source', label: 'Source', value: filter.source ?? '', options: options.sources, onChange: (source) => setField({ source: source || undefined }) },
              { kind: 'select', key: 'repository', label: 'Repository', value: filter.repository ?? '', options: options.repositories, onChange: (repository) => setField({ repository: repository || undefined }) },
              { kind: 'select', key: 'kind', label: 'Kind', value: filter.kind ?? '', options: KIND_OPTIONS, onChange: (kind) => setField({ kind: (kind || undefined) as UntriagedFilter['kind'] }) },
              { kind: 'select', key: 'age', label: 'Age', value: filter.age ?? '', options: AGE_OPTIONS, onChange: (value) => setField({ age: value || undefined }) },
              { kind: 'select', key: 'author', label: 'Author', value: filter.author ?? '', options: options.authors, onChange: (author) => setField({ author: author || undefined }) },
              { kind: 'select', key: 'label', label: 'Label', value: filter.label ?? '', options: options.labels, onChange: (label) => setField({ label: label || undefined }) },
            ]}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1" style={{ minWidth: '16rem' }}>
                <p role="status" className="text-xs text-muted">
                  {shown.length === list.items.length ? `${list.items.length} untriaged` : `${shown.length} of ${list.items.length} untriaged`}
                  {chosen.length ? ` · ${chosen.length} selected` : ''}
                </p>
                <Checked list={list} now={now} />
              </div>
              <Tooltip text={bulk.tooltip}>
                {(describedBy) => (
                  <a
                    href={linkHref(chosen.length ? bulk.url : undefined)}
                    target="_top"
                    role="button"
                    aria-disabled={!chosen.length || undefined}
                    aria-describedby={describedBy}
                    tabIndex={0}
                    style={{ ...LINK_BUTTON, opacity: chosen.length ? 1 : 0.5, cursor: chosen.length ? 'pointer' : 'default' }}
                    className="text-sm"
                    data-bulk-open
                  >
                    <Radar size={ICON} aria-hidden="true" />
                    Open selected in Issue Radar
                  </a>
                )}
              </Tooltip>
              <IconLabel icon={Users} onClick={() => setSending(chosen)} disabled={!bulkSend.ok} tooltip={bulkSend.reason}>
                Send selected to Issue Radar
              </IconLabel>
            </div>
          </FilterPanel>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">No untriaged item matches these filters. Clear them to see all {list.items.length}.</p>
          ) : narrow ? (
            <Stack items={pages.take('untriaged', shown)} selected={selected} now={now} onSelect={onSelect} onSend={(item) => setSending([item])} onReview={(item) => void review(item)} onStart={(item, action) => void start(item, action)} />
          ) : (
            <Table items={pages.take('untriaged', shown)} selected={selected} now={now} onSelect={onSelect} onSend={(item) => setSending([item])} onReview={(item) => void review(item)} onStart={(item, action) => void start(item, action)} />
          )}
          <ShowMore {...pages.more('untriaged', shown.length)} />
        </>
      )}
      {sending && workspaceId && (
        <SendToRadar
          workspaceId={workspaceId}
          client={radar}
          items={sending}
          repository={sending[0].repository}
          onSent={() => void reload()}
          onClose={(text) => {
            setSending(null)
            setNote(text ?? null)
          }}
        />
      )}
    </section>
  )
}

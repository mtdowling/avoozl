import { useCallback, useEffect, useMemo, useState } from 'react'
import { BudgetActions } from './Budget.tsx'
import type { BudgetChip } from './budget-api.ts'
import { useAppApi } from './host.ts'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { CONFLICT_LABELS, safeHref, viewsClient, type ConflictItem, type Graph } from './views-api.ts'
import { relativeTime, taskClient, type SettleAction, type SettleResult, type TaskDetail } from './task-api.ts'
import {
  ACTION_LABELS,
  ACTION_TIPS,
  CONFLICT_FILTER_EVENT,
  bulkAction,
  conflictChoices,
  conflictFilterActive,
  matchesConflict,
  readConflictFilter,
  writeConflictFilter,
  type ConflictFilter,
  confirmSettle,
  itemKey,
  itemTime,
  noActionReason,
  resultMessage,
  conflictTaskId,
  settleActionOf,
  settleCount,
  settleTargets,
  whyLine,
  liveChats,
  withoutSettled,
} from './conflicts-api.ts'
import { useRead } from './useRead.ts'
import { Authority } from './Authority.tsx'
import { errorMessage } from './workspace-api.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { DangerBtn, IconBtn, IconLabel, ShowMore, TipBtn, ViewHeading, useAskChat, useConfirm, usePages } from './controls.tsx'
import { Tooltip } from './Tooltip.tsx'
import { FilterPanel, useStoredFilter } from './FilterPanel.tsx'
import { Check, DetailsIcon, ExternalLink, Eye, History, MessageSquare, RefreshCw, RotateCcw, X } from './icons.ts'
import { itemRef } from './chat-api.ts'
import { linkHref } from './views-api.ts'
import { optionItems } from './picker.ts'
import { routingClient } from './routing-api.ts'
import { releaseClient } from './release-api.ts'

const CONFLICT_STORE = { event: CONFLICT_FILTER_EVENT, read: readConflictFilter, write: writeConflictFilter, empty: {} as ConflictFilter }

const LABELS: Record<string, string> = {
  ...CONFLICT_LABELS,
  'github-conflict': 'GitHub edit',
  'tracker-conflict': 'Tracker edit',
}

const FIELD_NAMES: Record<string, string> = {
  title: 'Title',
  body: 'Managed body section',
  labels: 'Managed labels',
  blockers: 'Blocked-by links',
  state: 'Issue state',
  identity: 'Issue identity',
}

const shownValue = (value: string | string[] | null | undefined) =>
  Array.isArray(value) ? (value.length ? value.join(', ') : 'none') : value ? value : 'empty'

function Values({ item }: { item: ConflictItem }) {
  if (item.expected === undefined && item.actual === undefined) return null
  const block = (label: string, value: ConflictItem['expected']) => (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
        {shownValue(value)}
      </pre>
    </div>
  )
  return (
    <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}>
      {block('Avoozl expected', item.expected)}
      {block(item.changedBy ? `GitHub has (changed by ${item.changedBy})` : 'GitHub has', item.actual)}
    </div>
  )
}

// One item's resolve choices, shared by the Conflicts tab and the task
// drawer. Each call reports a result; `onSettled` lets the list drop the
// item at once. A choice one click cannot undo asks first.
export function ConflictActions(props: {
  item: ConflictItem
  workspaceId: string
  revision: number
  busy: boolean
  run: (call: () => Promise<{ ok: boolean; text: string }>) => void
  onSettled: (action: SettleAction, result: SettleResult) => void
}) {
  const { item, workspaceId, revision, busy, run } = props
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const tasks = useMemo(() => taskClient(api), [api])
  const [answer, setAnswer] = useState('')
  const action = settleActionOf(item)
  const issue = safeHref(item.issue?.url ?? null)
  const settle = (chosen: SettleAction, extra?: string) =>
    run(async () => {
      const result = await tasks.settle(workspaceId, chosen, settleTargets(item), revision, extra)
      props.onSettled(chosen, result)
      return resultMessage(chosen, result)
    })
  const why = noActionReason(item)
  return (
    <div className="flex flex-col gap-2">
      {(item.kind === 'budget' || item.kind === 'over-budget') && item.taskId && (item as ConflictItem & { budget?: BudgetChip }).budget && (
        <BudgetActions
          workspaceId={workspaceId}
          taskId={item.taskId}
          budget={(item as ConflictItem & { budget: BudgetChip }).budget}
          onDone={(text) => run(async () => ({ ok: true, text }))}
        />
      )}
      {item.kind === 'investigation' && item.taskId && <InvestigationActions item={item} busy={busy} onDecide={(action, text) => run(async () => {
        await views.decideInvestigation(workspaceId, item.taskId!, action)
        return { ok: true, text }
      })} />}
      {item.kind === 'routing-failed' && <RoutingFailedActions busy={busy} run={run} workspaceId={workspaceId} />}
      {item.kind === 'ready-to-merge' && <ReadyToMerge item={item} busy={busy} onIntegrate={() => run(async () => {
        await views.integrate(workspaceId, item.taskId!, item.commit)
        return { ok: true, text: `${item.taskId} lands on the next tick.` }
      })} />}
      {item.kind === 'branch-landing' && item.repository && item.branch && item.head && (
        <LandBranch item={item} busy={busy} onLand={() => run(async () => {
          await releaseClient(api).land(workspaceId, item.repository!, item.branch!, item.head!)
          return { ok: true, text: `${item.branch} is approved to land. Merge it on GitHub.` }
        })} />
      )}
      {item.kind === 'content-match' && item.id && (
        <ContentActions id={item.id} readable={item.readable === true} workspaceId={workspaceId} busy={busy} run={run} />
      )}
      {item.kind === 'github-conflict' && (item.choices?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <DangerBtn
            icon={RotateCcw}
            tooltip="Next tick writes Avoozl's value over the GitHub edit"
            disabled={busy || item.resolution === 'desired'}
            confirm={{
              title: `Re-apply Avoozl's ${FIELD_NAMES[item.field ?? ''] ?? item.field} on ${item.taskId}?`,
              body: `The next tick writes Avoozl's value over the edit ${item.changedBy ?? 'someone'} made on GitHub. Their text is lost unless they keep a copy.`,
              action: 'Re-apply',
            }}
            onConfirm={() =>
              run(async () => {
                await views.resolveConflict(workspaceId, item.taskId!, item.field!, 'desired')
                return { ok: true, text: 'Avoozl rewrites it on the next tick.' }
              })
            }
          >
            Re-apply Avoozl’s value
          </DangerBtn>
          <IconLabel
            icon={Check}
            tooltip="Keep GitHub's edit until the spec changes this field"
            disabled={busy || item.resolution === 'github'}
            onClick={() =>
              run(async () => {
                await views.resolveConflict(workspaceId, item.taskId!, item.field!, 'github')
                return { ok: true, text: 'GitHub’s value stays until the spec changes this field.' }
              })
            }
          >
            Keep GitHub’s value
          </IconLabel>
          {item.resolution && <span className="text-xs text-muted">Chosen; applied on the next tick.</span>}
        </div>
      )}
      {action === 'settle' && (
        <div className="flex flex-wrap items-end gap-2">
          <label htmlFor={`answer-${itemKey(item)}`} className="flex flex-1 flex-col gap-1 text-xs" style={{ minWidth: '16rem' }}>
            <span>Your answer to “{item.detail}”</span>
            <Input id={`answer-${itemKey(item)}`} value={answer} onChange={(event) => setAnswer(event.target.value)} />
          </label>
          <DangerBtn
            icon={Check}
            tooltip={ACTION_TIPS.settle}
            disabled={busy || !answer.trim()}
            confirm={confirmSettle('settle', 1, item.title)}
            onConfirm={() => settle('settle', answer.trim())}
          >
            Settle
          </DangerBtn>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {action === 'dismiss' && (
          <DangerBtn icon={X} tooltip={ACTION_TIPS.dismiss} disabled={busy} confirm={confirmSettle('dismiss', 1, item.title)} onConfirm={() => settle('dismiss')}>
            Dismiss
          </DangerBtn>
        )}
        {item.kind === 'review' && action === 'reviewed' && (
          <ReviewButton item={item} busy={busy} onConfirm={() => settle('reviewed')} />
        )}
        {action && action !== 'settle' && action !== 'dismiss' && item.kind !== 'review' && (
          <IconLabel icon={Check} tooltip={ACTION_TIPS[action]} disabled={busy} onClick={() => settle(action)}>
            {ACTION_LABELS[action]}
          </IconLabel>
        )}
        {item.kind === 'stale-session' && item.deliveryState === 'decision' && (
          <IconLabel
            icon={RotateCcw}
            tooltip="Starts a new attempt for this task's delivery."
            disabled={busy}
            onClick={() =>
              run(async () => {
                await views.retry(workspaceId, item.taskId!)
                return { ok: true, text: `Retrying ${item.taskId}.` }
              })
            }
          >
            Retry delivery
          </IconLabel>
        )}
        {item.kind === 'stale-session' && item.deliveryState !== 'decision' && (
          <span className="text-xs text-muted">Avoozl starts a new attempt on its own; dismiss this once you have read it.</span>
        )}
        {item.kind === 'tracker-conflict' && safeHref(item.link ?? null) && (
          <a href={safeHref(item.link ?? null)!} target="_blank" rel="noreferrer" className="text-sm underline">
            Open in the tracker
          </a>
        )}
        {issue && (
          <a href={linkHref(issue)} target="_blank" rel="noreferrer" className="text-sm underline">
            {item.kind === 'needs-human' && item.reason === 'review-draft' ? `Open pull request${item.pullRequest ? ` #${item.pullRequest}` : ''}` : 'Open the issue'}
          </a>
        )}
      </div>
      {why && <p className="text-xs text-muted">{why}</p>}
    </div>
  )
}

const CONFIDENCE_LABEL = { low: 'Low', medium: 'Medium', high: 'High' } as const

// Findings the gate did not pass (§4.21): what the worker found, what the
// falsifier said, and the person's three choices.
export function InvestigationActions(props: {
  item: ConflictItem
  busy: boolean
  onDecide: (action: 'go' | 'again' | 'stop', text: string) => void
}) {
  const { item, busy } = props
  const f = item.findings
  const row = (label: string, value: string) => (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm">{value}</dd>
    </div>
  )
  return (
    <div className="flex flex-col gap-2" data-investigation={item.taskId}>
      {f && (
        <dl className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}>
          {row('Read', f.read)}
          {row('Cause or approach', f.cause)}
          {row('Planned change', f.plan)}
          {row('How it is checked', f.check)}
          {row('Worker is sure', CONFIDENCE_LABEL[f.confidence])}
        </dl>
      )}
      {item.reply && (
        <div className="rounded border p-2 text-sm" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xs text-muted">
            Falsifier: {item.reply.verdict === 'refuted' ? 'refuted' : 'stands'}, {CONFIDENCE_LABEL[item.reply.confidence].toLowerCase()} confidence
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words">{item.reply.evidence}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <IconLabel icon={Check} tooltip="The worker codes the change it planned" disabled={busy} onClick={() => props.onDecide('go', `Go ahead sent to ${item.taskId}.`)}>
          Go ahead
        </IconLabel>
        <IconLabel icon={RefreshCw} tooltip="One more round: the worker reads the falsifier's reply and reports new findings" disabled={busy} onClick={() => props.onDecide('again', `${item.taskId} investigates again.`)}>
          Investigate again
        </IconLabel>
        <DangerBtn
          icon={X}
          tooltip="The worker stops and reports blocked"
          disabled={busy}
          confirm={{ title: `Stop ${item.taskId}?`, body: 'The worker changes nothing and reports blocked. You can retry the task later.', action: 'Stop' }}
          onConfirm={() => props.onDecide('stop', `${item.taskId} stops.`)}
        >
          Stop
        </DangerBtn>
      </div>
    </div>
  )
}

// Routing failed three times in a row (§4.10, R41.7): ask again now, or
// turn routing off so tasks run on this machine.
export function RoutingFailedActions(props: { busy: boolean; workspaceId: string; run: (call: () => Promise<{ ok: boolean; text: string }>) => void }) {
  const api = useAppApi()
  const routing = useMemo(() => routingClient(api), [api])
  return (
    <div className="flex flex-wrap items-center gap-2" data-routing-failed>
      <IconLabel
        icon={RefreshCw}
        tooltip="Ask the routing agent again on the next tick, without waiting for the backoff"
        disabled={props.busy}
        onClick={() =>
          props.run(async () => {
            await routing.retry(props.workspaceId)
            return { ok: true, text: 'Routing is asked again on the next tick.' }
          })
        }
      >
        Retry now
      </IconLabel>
      <DangerBtn
        icon={X}
        tooltip="Switch routing off: ready tasks run on this machine"
        disabled={props.busy}
        confirm={{ title: 'Turn routing off?', body: 'Ready tasks run on this machine from the next tick. Your routing prompt is kept; switch it on again in Settings › Routing.', action: 'Turn routing off' }}
        onConfirm={() =>
          props.run(async () => {
            await routing.turnOff(props.workspaceId)
            return { ok: true, text: 'Routing is off. Ready tasks run on this machine.' }
          })
        }
      >
        Turn routing off
      </DangerBtn>
    </div>
  )
}

// Landing an integration branch (RC16.6): the person approves one head, then
// merges it on GitHub. Avoozl never merges the branch.
export function LandBranch(props: { item: ConflictItem; busy: boolean; onLand: () => void }) {
  const { item, busy } = props
  const link = safeHref(item.link ?? null)
  return (
    <div className="flex flex-wrap items-center gap-2" data-branch-landing={item.branch}>
      {link && (
        <a href={linkHref(link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
          <ExternalLink size={14} aria-hidden="true" />
          Compare {item.branch} with the default branch
        </a>
      )}
      <DangerBtn
        icon={Check}
        tooltip="Records your approval for this head. You merge the branch on GitHub yourself."
        disabled={busy}
        confirm={{ title: `Approve landing ${item.branch}?`, body: `This approves head ${String(item.head ?? '').slice(0, 7)} only. If the branch moves, you approve again. Avoozl does not merge it.`, action: 'Approve landing' }}
        onConfirm={props.onLand}
      >
        Approve landing
      </DangerBtn>
    </div>
  )
}

// Ready to merge (§4.25): a link to the pull request a person merges on
// GitHub, or Integrate for a local task.
export function ReadyToMerge(props: { item: ConflictItem; busy: boolean; onIntegrate: () => void }) {
  const { item, busy } = props
  const link = safeHref(item.link ?? null)
  return (
    <div className="flex flex-wrap items-center gap-2" data-ready-to-merge={item.taskId}>
      {link && (
        <a href={linkHref(link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
          <ExternalLink size={14} aria-hidden="true" />
          Open pull request{item.pullRequest ? ` #${item.pullRequest}` : ''} to merge it
        </a>
      )}
      {item.integrate && (
        <DangerBtn
          icon={Check}
          tooltip="Land this task's verified commit on its integration branch"
          disabled={busy}
          confirm={{ title: `Integrate ${item.taskId}?`, body: `Avoozl lands commit ${String(item.commit ?? '').slice(0, 12)} on the next tick, after its checks run again.`, action: 'Integrate' }}
          onConfirm={props.onIntegrate}
        >
          Integrate
        </DangerBtn>
      )}
    </div>
  )
}

// Mark a review group's tasks reviewed, after a confirm that names them.
export function ReviewButton({ item, busy, onConfirm }: { item: ConflictItem; busy: boolean; onConfirm: () => void }) {
  const ask = useConfirm()
  const count = settleCount([item])
  return (
    <IconLabel
      icon={Check}
      tooltip="Count these tasks as reviewed so they may start when ready"
      disabled={busy}
      onClick={() => void ask(confirmSettle('reviewed', count, count === 1 ? item.tasks?.[0]?.title : undefined)).then((yes) => yes && onConfirm())}
    >
      Mark {count} reviewed
    </IconLabel>
  )
}

// A blocked write (design §4.9): read the matched line again from its
// source, or allow this exact content once with a reason. Only a person can.
function ContentActions(props: {
  id: string
  readable: boolean
  workspaceId: string
  busy: boolean
  run: (call: () => Promise<{ ok: boolean; text: string }>) => void
}) {
  const { id, readable, workspaceId, busy, run } = props
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const [reason, setReason] = useState('')
  const [line, setLine] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      {readable && (
        <div className="flex flex-wrap items-center gap-2">
          <IconLabel
            icon={Eye}
            tooltip="Read the matched line again from its source. Not stored."
            disabled={busy}
            onClick={() =>
              run(async () => {
                const shown = await views.showContentLine(workspaceId, id)
                setLine(shown.text ?? null)
                return shown.text === null
                  ? { ok: false, text: shown.reason ?? 'The source cannot be read again.' }
                  : { ok: true, text: `Line ${shown.line ?? ''} read from its source. It is not stored.` }
              })
            }
          >
            Show the matched line
          </IconLabel>
        </div>
      )}
      {line !== null && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          {line}
        </pre>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={`allow-${id}`} className="flex flex-1 flex-col gap-1 text-xs" style={{ minWidth: '16rem' }}>
          <span>Why this exact content may go out once (required)</span>
          <Input id={`allow-${id}`} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <DangerBtn
          icon={Check}
          tooltip="Let this exact content out once. It can't be taken back."
          disabled={busy || !reason.trim()}
          confirm={{
            title: 'Allow this content once?',
            body: 'The next write of this exact content goes out, though a rule blocked it. Any change is checked again. It cannot be taken back once written.',
            action: 'Allow once',
          }}
          onConfirm={() =>
            run(async () => {
              await views.allowContentOnce(workspaceId, id, reason.trim())
              return { ok: true, text: 'Allowed once. The next write of this exact content passes; any change is checked again.' }
            })
          }
        >
          Allow once
        </DangerBtn>
      </div>
    </div>
  )
}

// An item's story, read when History opens: the values that differ, its
// task's plan, and the task's events, newest first.
function ItemHistory({ item, workspaceId }: { item: ConflictItem; workspaceId: string }) {
  const api = useAppApi()
  const tasks = useMemo(() => taskClient(api), [api])
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!item.taskId) return
    tasks.detail(workspaceId, item.taskId).then(setDetail, (caught: unknown) => setError(errorMessage(caught)))
  }, [tasks, workspaceId, item.taskId])
  return (
    <div className="mt-2 flex flex-col gap-2 rounded border p-2 text-sm" style={{ borderColor: 'var(--border)' }} data-history>
      <Values item={item} />
      {error && <p className="text-xs text-danger">{error}</p>}
      {detail && (
        <>
          <p className="text-xs text-muted">
            Spec: {detail.plan ? `${detail.plan.title} (${detail.plan.approved ? 'approved' : (detail.plan.state ?? 'draft')})` : 'none'}
            {detail.task.epicTitle ? ` · Epic: ${detail.task.epicTitle}` : ''} · State: {detail.task.state ?? 'unknown'}
          </p>
          {detail.timeline.length ? (
            <ol className="flex flex-col gap-0.5 text-xs">
              {detail.timeline.slice(0, 12).map((entry, i) => (
                <li key={i} className="flex gap-2">
                  <Tooltip text={entry.at}>
                    <span className="w-20 shrink-0 text-muted">{relativeTime(entry.at)}</span>
                  </Tooltip>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted">Nothing recorded yet.</p>
          )}
        </>
      )}
      {!item.taskId && <p className="text-xs text-muted">This item belongs to the workspace, not one task.</p>}
    </div>
  )
}

// One compact row: why it needs you, its task and plan, its age, and its
// actions. History and the resolve choices open under it.
function ConflictRow(props: {
  item: ConflictItem
  plan: string | null
  attach: string | null
  workspaceId: string
  revision: number
  busy: boolean
  selectable: boolean
  selected: boolean
  onSelect: (on: boolean) => void
  run: (call: () => Promise<{ ok: boolean; text: string }>) => void
  onSettled: (action: SettleAction, result: SettleResult) => void
  onAsk: () => void
  onReviewed: () => void
}) {
  const { item } = props
  const drawer = useTaskDrawer()
  const [open, setOpen] = useState<'history' | 'resolve' | null>(null)
  const time = itemTime(item as ConflictItem & { openedAt?: string | null })
  return (
    <li className="border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }} data-conflict-row>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <input
          type="checkbox"
          aria-label={`Select ${item.title}`}
          checked={props.selected}
          disabled={!props.selectable}
          onChange={(event) => props.onSelect(event.target.checked)}
        />
        <Badge variant={['decision', 'needs-human', 'review', 'content-match', 'content-unavailable'].includes(item.kind) ? 'warning' : 'danger'}>
          {LABELS[item.kind] ?? item.kind}
        </Badge>
        {item.field && <Badge>{FIELD_NAMES[item.field] ?? item.field}</Badge>}
        {item.taskId ? (
          <button type="button" className="font-medium underline" onClick={() => drawer.openTask(item.taskId!)}>
            {item.title}
          </button>
        ) : (
          <span className="font-medium">{item.title}</span>
        )}
        {item.taskId && <span className="text-xs text-muted">{item.taskId}</span>}
        <Authority owner={item} />
        {props.plan && <span className="text-xs text-muted">· spec {props.plan}</span>}
        {time && (
          <Tooltip text={time}>
            <span className="text-xs text-muted">· {relativeTime(time)}</span>
          </Tooltip>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {props.attach && (
            <a href={linkHref(props.attach)} className="self-center text-sm underline" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={14} aria-hidden="true" />
              Attach
            </a>
          )}
          <IconBtn icon={MessageSquare} label={`Ask in a chat about ${item.title}`} tooltip="Ask in a chat: a new chat seeded with this item's full context" onClick={props.onAsk} />
          {item.kind === 'review' ? (
            <IconBtn icon={DetailsIcon} label={`Info: ${item.title}`} tooltip="Why these tasks need review, and the list of them" onClick={() => drawer.openReview(item, props.onReviewed)} />
          ) : (
            <IconBtn icon={History} label={`History of ${item.title}`} tooltip="History" onClick={() => setOpen(open === 'history' ? null : 'history')} />
          )}
          {item.taskId && <IconBtn icon={DetailsIcon} label={`View task ${item.taskId}`} tooltip="Open this task's details in the drawer" onClick={() => drawer.openTask(item.taskId!)} />}
          <IconLabel icon={Check} tooltip="Show the ways to resolve this item" onClick={() => setOpen(open === 'resolve' ? null : 'resolve')}>
            Resolve
          </IconLabel>
        </span>
      </div>
      <p className="mt-0.5 text-sm text-muted" style={{ paddingLeft: 22 }}>
        {whyLine(item)}
      </p>
      {open === 'history' && <ItemHistory item={item} workspaceId={props.workspaceId} />}
      {open === 'resolve' && (
        <div className="mt-2 rounded border p-2" style={{ borderColor: 'var(--border)' }}>
          <ConflictActions item={item} workspaceId={props.workspaceId} revision={props.revision} busy={props.busy} run={props.run} onSettled={props.onSettled} />
        </div>
      )}
    </li>
  )
}

export default function ConflictsView({ workspaceId, embedded }: { workspaceId: string | null; embedded?: boolean }) {
  const api = useAppApi()
  const client = useMemo(() => viewsClient(api), [api])
  const tasks = useMemo(() => taskClient(api), [api])
  const chat = useAskChat(workspaceId)
  const ask = useConfirm()
  const load = useCallback(
    async (id: string) => {
      const [page, graph, delivery] = await Promise.all([
        client.conflictsPage(id),
        client.graph(id).catch(() => null),
        client.delivery(id).catch(() => []),
      ])
      return { page, graph, delivery }
    },
    [client],
  )
  const { value, error, busy, reload } = useRead(workspaceId, load)
  const [filter, setFilter] = useStoredFilter(workspaceId, CONFLICT_STORE)
  const reset = JSON.stringify(filter)
  const pages = usePages(reset)
  const [items, setItems] = useState<ConflictItem[] | null>(null)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [acting, setActing] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    setItems(value?.page.items ?? null)
    setRevision(value?.page.revision ?? 0)
    setSelected(new Set())
  }, [value])

  // Each task's plan, by the spec folder or plan ID graph.view names.
  const plans = useMemo(() => {
    const graph: Graph | null = value?.graph ?? null
    return new Map((graph?.tasks ?? []).map((t) => [t.id, t.spec ?? t.planId ?? null]))
  }, [value])
  const tasksById = useMemo(() => new Map((value?.graph?.tasks ?? []).map((t) => [t.id, t])), [value])
  // A filter change starts the selection over, like the list.
  useEffect(() => setSelected(new Set()), [reset])
  // Each task's live worker chat, to attach to.
  const attach = useMemo(() => liveChats(value?.delivery ?? []), [value])

  const run = (call: () => Promise<{ ok: boolean; text: string }>) => {
    setActing(true)
    setMessage(null)
    void (async () => {
      try {
        setMessage(await call())
      } catch (caught) {
        const text = errorMessage(caught)
        setMessage({ ok: false, text: /Database changed/.test(text) ? 'Something changed elsewhere. Refresh, then try again.' : text })
      } finally {
        setActing(false)
      }
    })()
  }
  const onSettled = (action: SettleAction, result: SettleResult) => {
    setRevision(result.revision)
    setItems((current) => (current ? withoutSettled(current, action, result) : current))
    setSelected(new Set())
  }

  const all = items ?? []
  const choices = conflictChoices(all, value?.graph ?? null)
  const now = Date.now()
  // Every item the filters keep; the list shows the first pages of them.
  const matching = all.filter((item) => matchesConflict(item, filter, tasksById.get(conflictTaskId(item) ?? ''), now))
  const shown = pages.take('conflicts', matching)
  // Bulk acts on exactly the selected matching items, shown or not.
  const picked = matching.filter((item) => selected.has(itemKey(item)))
  const allShown = shown.length > 0 && shown.every((item) => selected.has(itemKey(item)))
  const allMatching = picked.length === matching.length && matching.length > 0
  const action = bulkAction(picked)
  const setField = (change: Partial<ConflictFilter>) => {
    const next: Record<string, unknown> = { ...filter, ...change }
    for (const key of Object.keys(next)) if (!next[key]) delete next[key]
    setFilter(next as ConflictFilter)
  }
  const applyBulk = async () => {
    if (!workspaceId || !action) return
    if (!(await ask(confirmSettle(action, settleCount(picked))))) return
    run(async () => {
      const result = await tasks.settle(workspaceId, action, picked.flatMap(settleTargets), revision)
      onSettled(action, result)
      return resultMessage(action, result)
    })
  }
  const select = (item: ConflictItem, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(itemKey(item))
    else next.delete(itemKey(item))
    setSelected(next)
  }

  return (
    <section aria-labelledby="avoozl-conflicts-title" className="flex flex-col gap-3.5">
      <ViewHeading
        id="avoozl-conflicts-title"
        view="conflicts"
        level={embedded ? 3 : 2}
        actions={
          workspaceId && (
            <IconLabel icon={RefreshCw} onClick={() => void reload()} disabled={busy || acting}>
              Refresh
            </IconLabel>
          )
        }
      >
        Conflicts
      </ViewHeading>
      <p className="text-sm text-muted">
        Edits to what Avoozl manages on an issue, decisions, tasks waiting on you, and sessions that ended. Board drags are orders, not
        conflicts.
      </p>
      {(error || chat.error) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? chat.error}
        </p>
      )}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-muted' : 'text-danger'}`}>
          {message.text}
        </p>
      )}
      {!workspaceId ? (
        <p className="text-sm text-muted">Choose a workspace in the header.</p>
      ) : items === null ? (
        <p className="text-sm text-muted">{busy ? 'Loading…' : 'Not loaded'}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">No open conflicts or decisions.</p>
      ) : (
        <>
          <FilterPanel
            id="avoozl-conflicts"
            label="Filter conflicts"
            active={conflictFilterActive(filter)}
            onClear={() => setFilter({})}
            fields={[
              { kind: 'search', key: 'q', label: 'Search', value: filter.q ?? '', placeholder: 'Task, ID or detail', onChange: (q) => setField({ q }) },
              { kind: 'select', key: 'kind', label: 'Kind', value: filter.kind ?? '', options: choices.kinds, onChange: (kind) => setField({ kind }) },
              { kind: 'pick', key: 'plan', label: 'Spec', value: filter.plan ?? '', items: optionItems(choices.plans), onChange: (plan) => setField({ plan }) },
              { kind: 'select', key: 'epic', label: 'Epic', value: filter.epic ?? '', options: choices.epics, onChange: (epic) => setField({ epic }) },
              {
                kind: 'select',
                key: 'repository',
                label: 'Repository',
                value: filter.repository ?? '',
                options: choices.repositories,
                onChange: (repository) => setField({ repository }),
              },
              { kind: 'select', key: 'age', label: 'Age', value: filter.age ?? '', options: choices.ages, onChange: (age) => setField({ age }) },
              {
                kind: 'select',
                key: 'changed-by',
                label: 'Changed by',
                value: filter.changedBy ?? '',
                options: choices.changedBy,
                onChange: (changedBy) => setField({ changedBy }),
              },
            ]}
          >
            <p role="status" className="text-xs text-muted">
              {matching.length} of {items.length} items
            </p>
          </FilterPanel>
          <div className="flex flex-wrap items-center gap-2 text-sm" data-bulk-bar>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                aria-label={`Select the ${shown.length} shown`}
                checked={allShown}
                onChange={(event) => {
                  const next = new Set(selected)
                  for (const item of shown) event.target.checked ? next.add(itemKey(item)) : next.delete(itemKey(item))
                  setSelected(next)
                }}
              />
              Select the {shown.length} shown
            </label>
            {matching.length > shown.length && (
              <TipBtn tooltip="Select every matching item, including ones not shown yet" type="button" onClick={() => setSelected(new Set(matching.map(itemKey)))} disabled={allMatching}>
                Select all {matching.length} matching
              </TipBtn>
            )}
            <span role="status" className="text-xs text-muted" data-selection>
              {picked.length
                ? `${picked.length} selected${allMatching ? `: all ${matching.length} matching` : allShown && picked.length === shown.length ? `: the ${shown.length} shown` : ''}. Bulk acts on these ${picked.length}. · `
                : ''}
              {shown.length} shown of {matching.length}
              {acting ? ' · Working…' : ''}
            </span>
            {picked.length > 0 && (
              <>
                <IconLabel icon={MessageSquare} tooltip="Start a Kiro Crew chat seeded with the selected items" onClick={() => void chat.ask({ items: picked.map(itemRef) })}>
                  Ask in a chat about {picked.length} {picked.length === 1 ? 'item' : 'items'}
                </IconLabel>
                {action ? (
                  <TipBtn tooltip={ACTION_TIPS[action]} type="button" primary onClick={() => void applyBulk()} disabled={acting}>
                    {ACTION_LABELS[action]} {picked.length}
                  </TipBtn>
                ) : (
                  <span className="text-xs text-muted">Bulk resolve needs items of one kind.</span>
                )}
                <Btn onClick={() => setSelected(new Set())} disabled={acting}>
                  Clear selection
                </Btn>
              </>
            )}
          </div>
          <Card>
            <ul className="flex flex-col">
              {shown.map((item) => (
                <ConflictRow
                  key={itemKey(item)}
                  item={item}
                  plan={item.taskId ? (plans.get(item.taskId) ?? null) : null}
                  onReviewed={() => void reload()}
                  attach={(item.kind === 'stale-session' ? item.link : null) ?? (item.taskId ? (attach.get(item.taskId) ?? null) : null)}
                  workspaceId={workspaceId}
                  revision={revision}
                  busy={acting}
                  selectable
                  selected={selected.has(itemKey(item))}
                  onSelect={(on) => select(item, on)}
                  run={run}
                  onSettled={onSettled}
                  onAsk={() => void chat.ask({ items: [itemRef(item)] })}
                />
              ))}
            </ul>
            <ShowMore {...pages.more('conflicts', matching.length)} />
            {matching.length === 0 && <p className="text-sm text-muted">No item matches these filters.</p>}
          </Card>
        </>
      )}
    </section>
  )
}

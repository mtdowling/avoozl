import { useCallback, useEffect, useMemo, useState } from 'react'
import { PlanReviewDecision } from './PlanReviewDecision.tsx'
import { useAppApi } from './host.ts'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { ConflictFixActions } from './ConflictFixActions.tsx'
import { SpecPullDecision } from './SpecPullDecision.tsx'
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
import { ListDetailLayout } from './ListDetailLayout.tsx'
import { usePhone } from './list-detail.ts'
import { Tooltip } from './Tooltip.tsx'
import { ForwardScreen } from './ForwardScreen.tsx'
import { FilterPanel, useStoredFilter } from './FilterPanel.tsx'
import { RefreshButton } from './RefreshButton.tsx'
import { Check, CirclePlus, DetailsIcon, ExternalLink, Eye, FileText, History, MessageSquare, Play, RefreshCw, RotateCcw, X } from './icons.ts'
import { escalationAsk, untriagedClient } from './untriaged-api.ts'
import { itemRef } from './chat-api.ts'
import { linkHref } from './views-api.ts'
import { optionItems } from './picker.ts'
import { ItemContextBlock, SpecLink } from './NeedsYouContext.tsx'
import { specOfItem } from './needs-you-context.ts'
import { releaseClient } from './release-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'

const CONFLICT_STORE = { event: CONFLICT_FILTER_EVENT, read: readConflictFilter, write: writeConflictFilter, empty: {} as ConflictFilter }

const LABELS: Record<string, string> = {
  ...CONFLICT_LABELS,
  'github-conflict': 'GitHub edit',
  'tracker-conflict': 'Tracker edit',
  'spec-pull': 'Spec pull request',
}

const FIELD_NAMES: Record<string, string> = {
  title: 'Title',
  body: 'Managed body section',
  labels: 'Managed labels',
  blockers: 'Blocked-by links',
  state: 'Issue state',
  identity: 'Issue identity',
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
  // Reads the list again (an action that settles outside the task graph).
  onReload?: () => void
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
    <Stack gap={2}>
      {item.kind === 'plan-review' && item.planReview && (
        <PlanReviewDecision key={`${workspaceId}:${item.planReview.planId}:${item.planReview.revisionHash}`} {...item.planReview} busy={busy} run={run} onDecide={(action) =>
          views.decidePlanReview(workspaceId, item.planReview!.planId, item.planReview!.revisionHash, action)
        } />
      )}
      {item.kind === 'spec-pull' && item.specPull && (
        <SpecPullDecision key={item.specPull.id} pull={item.specPull} workspaceId={workspaceId} onChanged={() => props.onReload?.()} />
      )}
      {item.kind === 'investigation' && item.taskId && <InvestigationActions item={item} busy={busy} onDecide={(action, text) => run(async () => {
        await views.decideInvestigation(workspaceId, item.taskId!, action)
        return { ok: true, text }
      })} />}
      {item.kind === 'needs-human' && item.reason === 'crew' && item.item && item.escalation && item.start && (
        <EscalationStart item={item} busy={busy} onStart={(action) => run(async () => {
          const made = await untriagedClient(api).start(workspaceId, item.item!, action, { confirmClaim: item.escalation!.claimed })
          return { ok: true, text: `${item.item!.id} is now task ${made.taskId}.` }
        })} />
      )}
      {item.kind === 'needs-human' && item.reason === 'conflict-fix' && item.conflictFix && (
        <ConflictFixActions fix={item.conflictFix} busy={busy} onDecide={(action, text) => run(async () => {
          await views.decideConflictFix(workspaceId, item.conflictFix!.repository, item.conflictFix!.pullRequest, action)
          return { ok: true, text }
        })} />
      )}
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
      {item.kind === 'needs-human' && item.reason === 'forward' && item.forwardId && (
        <ForwardButton item={item} workspaceId={workspaceId} onDone={() => void run(async () => ({ ok: true, text: 'Forwarded.' }))} />
      )}
      {item.kind === 'content-match' && item.id && (
        <ContentActions id={item.id} readable={item.readable === true} workspaceId={workspaceId} busy={busy} run={run} />
      )}
      {item.kind === 'github-conflict' && (item.choices?.length ?? 0) > 0 && (
        <Row gap={2}>
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
          {item.resolution && <Hint size="xs">Chosen; applied on the next tick.</Hint>}
        </Row>
      )}
      {action === 'settle' && (
        <Row gap={2} align="end">
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
        </Row>
      )}
      <Row gap={2}>
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
          <Hint size="xs">Avoozl starts a new attempt on its own; dismiss this once you have read it.</Hint>
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
      </Row>
      {why && <Hint as="p" size="xs">{why}</Hint>}
    </Stack>
  )
}

// Findings the gate did not pass (§4.21): the person's three choices. The
// findings and the falsifier's reply are the item's evidence above them.
export function InvestigationActions(props: {
  item: ConflictItem
  busy: boolean
  onDecide: (action: 'go' | 'again' | 'stop', text: string) => void
}) {
  const { item, busy } = props
  return (
    <Stack gap={2} data-investigation={item.taskId}>
      <Row gap={2}>
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
      </Row>
    </Stack>
  )
}

// Forward row (RC24.9, RC26.5.4): Review opens the Forward screen.
export function ForwardButton(props: { item: ConflictItem; workspaceId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Row gap={2} data-forward-row={props.item.forwardId}>
      <IconLabel icon={DetailsIcon} tooltip="Shows the exact public diff, title and body before anything is pushed." onClick={() => setOpen(true)}>
        Review and forward
      </IconLabel>
      {open && (
        <ForwardScreen
          workspaceId={props.workspaceId}
          forwardId={props.item.forwardId!}
          title={props.item.title}
          onClose={(forwarded) => {
            setOpen(false)
            if (forwarded) props.onDone()
          }}
        />
      )}
    </Row>
  )
}

// Landing an integration branch (RC16.6): the person approves one head, then
// merges it on GitHub. Avoozl never merges the branch.
export function LandBranch(props: { item: ConflictItem; busy: boolean; onLand: () => void }) {
  const { item, busy } = props
  const link = safeHref(item.link ?? null)
  return (
    <Row gap={2} data-branch-landing={item.branch}>
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
    </Row>
  )
}

// Ready to merge (§4.25): a link to the pull request a person merges on
// GitHub, or Integrate for a local task.
export function ReadyToMerge(props: { item: ConflictItem; busy: boolean; onIntegrate: () => void }) {
  const { item, busy } = props
  const link = safeHref(item.link ?? null)
  return (
    <Row gap={2} data-ready-to-merge={item.taskId}>
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
    </Row>
  )
}

// Plan this and Deliver this on an Issue Radar escalation's Needs you row
// (R103.8), each asked first with what Avoozl writes on GitHub.
function EscalationStart({ item, busy, onStart }: { item: ConflictItem; busy: boolean; onStart: (action: 'deliver' | 'plan') => void }) {
  const ask = useConfirm()
  const name = item.item!.id.replace('#', ' #')
  const title = item.title.replace(/^.*? needs a person: /, '')
  const press = (action: 'deliver' | 'plan') => void ask(escalationAsk(name, title, item.escalation!, action)).then((yes) => yes && onStart(action))
  return (
    <Row gap={2} data-escalation-start>
      {item.start?.plan && (
        <IconLabel icon={FileText} tooltip="A planner drafts a fix spec from this issue. Avoozl adds crew:avoozl so crews skip it." disabled={busy} onClick={() => press('plan')}>
          Plan this
        </IconLabel>
      )}
      {item.start?.deliver && (
        <IconLabel icon={Play} tooltip="One bounded-fix task pinned to this text. Avoozl adds crew:avoozl so crews skip it." disabled={busy} onClick={() => press('deliver')}>
          Deliver this
        </IconLabel>
      )}
    </Row>
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
    <Stack gap={2}>
      {readable && (
        <Row gap={2}>
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
        </Row>
      )}
      {line !== null && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          {line}
        </pre>
      )}
      <Row gap={2} align="end">
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
      </Row>
    </Stack>
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
      {error && <ErrorText size="xs">{error}</ErrorText>}
      {detail && (
        <>
          <Hint as="p" size="xs">
            Spec: {detail.plan ? `${detail.plan.title} (${detail.plan.approved ? 'approved' : (detail.plan.state ?? 'draft')})` : 'none'}
            {detail.task.epicTitle ? ` · Epic: ${detail.task.epicTitle}` : ''} · State: {detail.task.state ?? 'unknown'}
          </Hint>
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
            <Hint as="p" size="xs">Nothing recorded yet.</Hint>
          )}
        </>
      )}
      {!item.taskId && <Hint as="p" size="xs">This item belongs to the workspace, not one task.</Hint>}
    </div>
  )
}

// One dense list row: the kind, the title, its spec and task, why, and age.
// A click on the title and reason picks it; its context and actions open in
// the right column. The spec is its own link, so it sits outside that button.
function ConflictListRow(props: { item: ConflictItem; focused: boolean; selectable: boolean; selected: boolean; onSelect: (on: boolean) => void; onFocus: () => void }) {
  const { item } = props
  const time = itemTime(item as ConflictItem & { openedAt?: string | null })
  const spec = specOfItem(item)
  const task = item.context?.task ?? (item.taskId ? { id: item.taskId, title: item.title } : null)
  return (
    <li className="border-t first:border-t-0" style={{ borderColor: 'var(--border)' }} data-conflict-row>
      <div className="flex items-start gap-2 px-1 py-1.5" style={{ background: props.focused ? 'var(--accent-subtle, var(--bg-elevated))' : undefined, borderRadius: 6 }}>
        <input
          type="checkbox"
          aria-label={`Select ${item.title}`}
          checked={props.selected}
          disabled={!props.selectable}
          onChange={(event) => props.onSelect(event.target.checked)}
          style={{ marginTop: 3 }}
        />
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5">
          <button
            type="button"
            data-conflict-pick={itemKey(item)}
            aria-current={props.focused ? 'true' : undefined}
            onClick={props.onFocus}
            className="flex min-w-0 flex-col items-stretch gap-0.5 text-left"
            style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Badge variant={['decision', 'needs-human', 'review', 'content-match', 'content-unavailable', 'spec-pull'].includes(item.kind) ? 'warning' : 'danger'}>
                {LABELS[item.kind] ?? item.kind}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
              {time && <span className="shrink-0 text-xs text-muted">{relativeTime(time)}</span>}
            </span>
            <span className="truncate text-xs text-muted" data-row-reason>
              {whyLine(item)}
            </span>
          </button>
          {(spec || task) && (
            <span className="truncate text-xs text-muted" data-row-where>
              {spec && (
                <>
                  Spec: <SpecLink spec={spec} />
                </>
              )}
              {spec && task && ' · '}
              {task && <span data-row-task>Task {task.id}</span>}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

// The picked item: why it needs you, its task and spec, its age, its
// actions and the ways to resolve it, and its history.
function ConflictDetail(props: {
  item: ConflictItem
  plan: string | null
  attach: string | null
  workspaceId: string
  revision: number
  busy: boolean
  run: (call: () => Promise<{ ok: boolean; text: string }>) => void
  onSettled: (action: SettleAction, result: SettleResult) => void
  onAsk: () => void
  onReviewed: () => void
  onReload?: () => void
}) {
  const { item } = props
  const drawer = useTaskDrawer()
  const [history, setHistory] = useState(false)
  // A phone's detail pane already shows the title over its Back row.
  const phone = usePhone()
  const time = itemTime(item as ConflictItem & { openedAt?: string | null })
  return (
    <Stack gap={3} data-conflict-detail={itemKey(item)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={['decision', 'needs-human', 'review', 'content-match', 'content-unavailable'].includes(item.kind) ? 'warning' : 'danger'}>
          {LABELS[item.kind] ?? item.kind}
        </Badge>
        {item.field && <Badge>{FIELD_NAMES[item.field] ?? item.field}</Badge>}
        {item.kind !== 'spec-pull' && <Authority owner={item} />}
        {item.taskId && <Hint size="xs">{item.taskId}</Hint>}
        {time && (
          <Tooltip text={time}>
            <Hint size="xs">· {relativeTime(time)}</Hint>
          </Tooltip>
        )}
      </div>
      {!phone && (
        <h3 className="m-0 text-lg font-semibold" style={{ overflowWrap: 'anywhere' }}>
          {item.title}
        </h3>
      )}
      <ItemContextBlock item={item} plan={props.plan} />
      <div className="flex flex-wrap items-center gap-1.5" data-conflict-actions>
        {item.taskId && (
          <IconLabel icon={DetailsIcon} tooltip="Open this task's details" onClick={() => drawer.openTask(item.taskId!)}>
            Task details
          </IconLabel>
        )}
        {props.attach && (
          <a href={linkHref(props.attach)} className="self-center text-sm underline" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CirclePlus size={14} aria-hidden="true" />
            Session
          </a>
        )}
        <IconLabel icon={MessageSquare} tooltip="Ask in a chat: a new chat seeded with this item's full context" onClick={props.onAsk}>
          Ask in a chat
        </IconLabel>
        {item.kind === 'review' ? (
          <IconLabel icon={DetailsIcon} tooltip="Why these tasks need review, and the list of them" onClick={() => drawer.openReview(item, props.onReviewed)}>
            Review info
          </IconLabel>
        ) : (
          <IconLabel icon={History} tooltip="Show this item's history" onClick={() => setHistory(!history)}>
            {history ? 'Hide history' : 'History'}
          </IconLabel>
        )}
      </div>
      <Card data-conflict-resolve>
        <h4 className="m-0 mb-2 text-sm font-semibold">Resolve</h4>
        <ConflictActions item={item} workspaceId={props.workspaceId} revision={props.revision} busy={props.busy} run={props.run} onSettled={props.onSettled} onReload={props.onReload} />
      </Card>
      {history && <ItemHistory item={item} workspaceId={props.workspaceId} />}
    </Stack>
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
  // The item open in the detail column; null shows the list alone.
  const [focus, setFocus] = useState<string | null>(null)

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
  // A settled or filtered-out item closes its detail.
  const current = focus ? (matching.find((item) => itemKey(item) === focus) ?? null) : null
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
    <section aria-labelledby={embedded ? undefined : 'avoozl-conflicts-title'} aria-label={embedded ? 'Decisions and conflicts' : undefined} className="flex h-full min-h-0 flex-col gap-2">
      {!embedded && (
        <ViewHeading
          id="avoozl-conflicts-title"
          view="conflicts"
          level={2}
          actions={workspaceId && <RefreshButton workspaceId={workspaceId} onRefresh={() => void reload()} busy={busy || acting} />}
        >
          Conflicts
        </ViewHeading>
      )}
      {(error || chat.error) && (
        <ErrorText role="alert" size="sm">
          {error ?? chat.error}
        </ErrorText>
      )}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-muted' : 'text-danger'}`}>
          {message.text}
        </p>
      )}
      {!workspaceId ? (
        <Hint as="p" size="sm">Choose a workspace in the header.</Hint>
      ) : items === null ? (
        <Hint as="p" size="sm">{busy ? 'Loading…' : 'Not loaded'}</Hint>
      ) : items.length === 0 ? (
        <Hint as="p" size="sm">No open conflicts or decisions.</Hint>
      ) : (
        <ListDetailLayout
          id="needs-you"
          backLabel="Needs you"
          detailTitle={current?.title ?? ''}
          onBack={() => setFocus(null)}
          list={
            <Stack gap={2} data-conflict-list-pane>
          <FilterPanel
                  folded
                  id="avoozl-conflicts"
                  label="Filter conflicts"
                  active={conflictFilterActive(filter)}
                  onClear={() => setFilter({})}
                  fields={[
                    { kind: 'search', key: 'q', label: 'Search', value: filter.q ?? '', placeholder: 'Task, ID or detail', onChange: (q) => setField({ q }), primary: true },
                    { kind: 'select', key: 'kind', label: 'Kind', value: filter.kind ?? '', options: choices.kinds, onChange: (kind) => setField({ kind }), primary: true },
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
                  {/* The count once, on the Filters row, with Refresh. */}
                  <Hint role="status" size="xs" data-conflict-count>
                    {matching.length} of {items.length}
                  </Hint>
                  <span className="ml-auto">{workspaceId && <RefreshButton workspaceId={workspaceId} onRefresh={() => void reload()} busy={busy || acting} />}</span>
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
                  <Hint role="status" size="xs" data-selection>
                    {picked.length
                      ? `${picked.length} selected${allMatching ? `: all ${matching.length} matching` : allShown && picked.length === shown.length ? `: the ${shown.length} shown` : ''}. Bulk acts on these ${picked.length}. · `
                      : ''}
                    {/* Only when a page holds back some of the matching items. */}
                    {shown.length < matching.length ? `${shown.length} shown of ${matching.length}` : ''}
                    {acting ? ' · Working…' : ''}
                  </Hint>
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
                        <Hint size="xs">Bulk resolve needs items of one kind.</Hint>
                      )}
                      <Btn onClick={() => setSelected(new Set())} disabled={acting}>
                        Clear selection
                      </Btn>
                    </>
                  )}
                </div>
                <ul className="m-0 flex list-none flex-col p-0" data-conflict-list>
                  {shown.map((item) => (
                    <ConflictListRow
                      key={itemKey(item)}
                      item={item}
                      focused={focus === itemKey(item)}
                      selectable
                      selected={selected.has(itemKey(item))}
                      onSelect={(on) => select(item, on)}
                      onFocus={() => setFocus(itemKey(item))}
                    />
                  ))}
                </ul>
                <ShowMore {...pages.more('conflicts', matching.length)} />
                {matching.length === 0 && <Hint as="p" size="sm">No item matches these filters.</Hint>}
            </Stack>
          }
          detail={
            current ? (
              <ConflictDetail
                item={current}
                plan={current.taskId ? (plans.get(current.taskId) ?? null) : null}
                onReviewed={() => void reload()}
                attach={(current.kind === 'stale-session' ? current.link : null) ?? (current.taskId ? (attach.get(current.taskId) ?? null) : null)}
                workspaceId={workspaceId}
                revision={revision}
                busy={acting}
                run={run}
                onSettled={onSettled}
                onReload={() => void reload()}
                onAsk={() => void chat.ask({ items: [itemRef(current)] })}
              />
            ) : null
          }
        />
      )}
    </section>
  )
}

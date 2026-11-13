// A task's review state, shared by the drawer, the Delivery card and the
// Dashboard: the review chats and verdicts when there are any, and a plain
// "waiting on your decision" block when status review was set by hand and
// nothing is running.
import { useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { noSessionLabel, reviewRuns, viewsClient, type DeliveryItem, type Graph } from './views-api.ts'
import { doneStatus, resumeStatus } from './delivery-api.ts'
import { IconBtn, IconLabel, useAskChat } from './controls.tsx'
import { Check, DetailsIcon, ExternalLink, MessageSquare, RotateCcw } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import { linkHref } from './views-api.ts'

const model = (requested: string | null, served: string | null) =>
  `asked ${requested ?? 'agent default'}${served ? `, ran ${served}` : ''}`

// Each review chat or verdict: role, round, models, verdict, Attach, Info.
export function ReviewRuns(props: { item: DeliveryItem | null; onInfo?: () => void; compact?: boolean }) {
  const runs = reviewRuns(props.item)
  if (!runs.length) return null
  return (
    <ul className={`flex flex-col gap-1 ${props.compact ? 'text-xs' : 'text-sm'}`} data-review-runs>
      {runs.map((run) => (
        <li key={run.key} className="flex flex-wrap items-center gap-1.5">
          <Badge variant={run.live ? 'info' : undefined}>{run.role}</Badge>
          <span>round {run.round}</span>
          <span className="text-muted">· {model(run.requested, run.served)}</span>
          {run.verdict ? (
            <Badge variant={run.verdict === 'approved' ? 'success' : 'warning'}>{run.stale ? `${run.verdict} (stale)` : run.verdict}</Badge>
          ) : (
            <span className="text-muted">· {run.live ? 'reviewing' : (run.status ?? 'no verdict')}</span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {run.link && (
              <a
                href={linkHref(run.link)}
                className="inline-flex items-center gap-1 underline"
                aria-label={`Attach to the ${run.role} chat, round ${run.round}`}
              >
                <ExternalLink size={12} aria-hidden="true" />
                Attach
              </a>
            )}
            {props.onInfo && <IconBtn icon={DetailsIcon} label={`Details of ${run.role} round ${run.round}`} tooltip="Open the task's details" onClick={props.onInfo} />}
          </span>
        </li>
      ))}
    </ul>
  )
}

// Status review with no session, run or delivery behind it. Says so, shows
// the task's next action, and offers what a person can do. Mark done and
// Back to planned go through task.update and only for local tasks; GitHub
// or a plugin owns the status of the rest.
export function HandSetReview(props: {
  workspaceId: string
  task: { id: string; title: string; authority?: string; nextAction?: string | null; noSession?: string | null }
  graph: Graph | null
  revision: number | null
  onChanged?: (text: string) => void
  onInfo?: () => void
  compact?: boolean
}) {
  const { task, workspaceId } = props
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const chat = useAskChat(workspaceId)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const local = (task.authority ?? 'local') === 'local'
  const done = doneStatus(props.graph)
  const planned = resumeStatus(props.graph)
  const set = async (status: string, text: string) => {
    if (props.revision === null) return
    setBusy(true)
    setError(null)
    try {
      await views.updateTask(workspaceId, task.id, { status }, props.revision)
      setConfirming(false)
      props.onChanged?.(text)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      data-hand-set-review
      className={`flex flex-col gap-2 rounded border p-2 ${props.compact ? 'text-xs' : 'text-sm'}`}
      style={{ borderColor: 'color-mix(in srgb, var(--warn, var(--muted)) 55%, var(--border))' }}
    >
      <span className="font-medium">{noSessionLabel(task.noSession)}</span>
      {task.nextAction ? (
        <span>
          <span className="text-muted">Next: </span>
          {task.nextAction}
        </span>
      ) : (
        <span className="text-muted">No next action recorded.</span>
      )}
      <div className="flex flex-wrap gap-1.5">
        <IconLabel icon={MessageSquare} tooltip="Start a Kiro Crew chat about this task. It changes nothing." onClick={() => void chat.ask({ tasks: [task.id] })}>
          Discuss
        </IconLabel>
        {local && done && !confirming && (
          <IconLabel icon={Check} disabled={busy || props.revision === null} tooltip="Mark it done. Tasks that wait on it may start. You confirm first." onClick={() => setConfirming(true)}>
            Mark done
          </IconLabel>
        )}
        {local && planned && (
          <IconLabel
            icon={RotateCcw}
            disabled={busy || props.revision === null}
            tooltip={`Set its status back to ${planned}. The tick may then start it.`}
            onClick={() => void set(planned, `Moved ${task.id} back to ${planned}.`)}
          >
            Back to planned
          </IconLabel>
        )}
        {props.onInfo && (
          <IconLabel icon={DetailsIcon} tooltip="Open this task's details in the drawer" onClick={props.onInfo}>
            Info
          </IconLabel>
        )}
      </div>
      {confirming && done && (
        <div role="group" aria-label="Confirm mark done" className="flex flex-wrap items-center gap-2" data-confirm-done>
          <span>Mark {task.title} {done}? Tasks that wait on it may start. Edit can set it back.</span>
          <Btn type="button" onClick={() => setConfirming(false)}>
            Cancel
          </Btn>
          <Btn type="button" primary disabled={busy} onClick={() => void set(done, `Marked ${task.id} ${done}.`)}>
            Mark done
          </Btn>
        </div>
      )}
      {!local && <span className="text-muted">{task.authority} owns this task&apos;s status; change it there.</span>}
      {(error || chat.error) && (
        <span role="alert" className="text-danger">
          {error ?? chat.error}
        </span>
      )}
    </div>
  )
}

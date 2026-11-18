// A spec pull request's evidence and buttons (Requirement 107.4, 107.5): the
// spec's Proposed change box and the Decisions item share it. It shows what
// the backend adopted and acts only through specPullClient.
import { useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import Badge from './Badge.tsx'
import { DiffBlock } from './FlowMemory.tsx'
import { SeverityBadges } from './SeverityBadges.tsx'
import { DangerBtn, TipBtn } from './controls.tsx'
import { safeHref } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import { CHECKS_TEXT, approveWhy, specPullClient, type SpecPull } from './spec-pr-api.ts'

const DOT: Record<string, string> = { passing: 'var(--ok, #1a7f37)', failing: 'var(--danger)', pending: 'var(--muted)' }

export function ChecksDot({ checks }: { checks: SpecPull['checks'] }) {
  if (!checks) return <span className="text-xs text-muted">No checks yet</span>
  return (
    <span className="inline-flex items-center text-xs" style={{ gap: 6 }} data-pull-checks={checks}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: DOT[checks] }} />
      {CHECKS_TEXT[checks]}
    </span>
  )
}

export function SpecPullBox(props: { pull: SpecPull; workspaceId: string; onApprove: () => void; onChanged: () => void }) {
  const { pull, workspaceId } = props
  const api = useAppApi()
  const client = useMemo(() => specPullClient(api), [api])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const why = approveWhy(pull)
  const open = pull.review.openBySeverity ?? {}
  const openCount = Object.values(open).reduce((sum, n) => sum + n, 0)
  const act = async (work: () => Promise<string>) => {
    setBusy(true)
    setError(null)
    try {
      setNote(await work())
      props.onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex min-w-0 flex-col text-sm" style={{ gap: 12 }} data-spec-pull={pull.id}>
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        {safeHref(pull.url) ? (
          <a href={safeHref(pull.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="underline" data-spec-pull-link>
            {pull.repository} #{pull.number}
          </a>
        ) : (
          <span>
            {pull.repository} #{pull.number}
          </span>
        )}
        <span className="text-muted">by {pull.author ?? 'unknown'}</span>
        <Badge variant={pull.draft ? undefined : 'success'}>{pull.draft ? 'Draft' : 'Ready'}</Badge>
        <ChecksDot checks={pull.checks} />
      </div>
      <div data-spec-pull-changes className="flex flex-col" style={{ gap: 4 }}>
        <p className="m-0 text-xs font-medium">{pull.newSpec ? 'New spec: every file is added.' : 'Changes since the approved revision'}</p>
        {pull.files.length ? (
          <ul className="m-0 flex list-none flex-col p-0" style={{ gap: 4 }}>
            {pull.files.map((file) => (
              <li key={file.file}>
                <details>
                  <summary className="cursor-pointer text-xs">
                    <code>{file.file}</code> · {file.status} · +{file.added} −{file.removed}
                  </summary>
                  <DiffBlock diff={file.diff} label={`Changes to ${file.file}`} />
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-xs text-muted">No spec document differs.</p>
        )}
        {pull.tasks.length > 0 && (
          <p className="m-0 text-xs text-muted" data-spec-pull-tasks>
            Tasks: {pull.tasks.map((task) => `${task.taskId} ${task.change}`).join(', ')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center" style={{ gap: 8 }} data-spec-pull-findings>
        <span className="text-xs font-medium">Review</span>
        {pull.review.state === 'not-reviewed' ? (
          <span className="text-xs text-muted">Not reviewed yet</span>
        ) : openCount ? (
          <SeverityBadges counts={open} label="Open findings by severity" />
        ) : (
          <span className="text-xs text-muted">{pull.review.found ? 'No open findings' : 'No findings'}</span>
        )}
        {!pull.review.current && pull.review.state !== 'not-reviewed' && <span className="text-xs text-muted">(an earlier revision)</span>}
      </div>
      {pull.review.summary && <p className="m-0 text-xs text-muted">{pull.review.summary}</p>}
      <div className="flex flex-wrap items-center" style={{ gap: 8 }} data-spec-pull-actions>
        <TipBtn variant="primary" tooltip={why ?? `Approve exactly this head (${pull.head.slice(0, 7)}). Avoozl merges the pull request when its checks pass.`} disabled={busy || why !== null} onClick={props.onApprove} data-spec-pull-approve>
          Approve
        </TipBtn>
        <TipBtn
          tooltip="Post the open review findings on the pull request as one comment."
          disabled={busy || openCount === 0}
          onClick={() => void act(async () => `Posted ${(await client.requestChanges(workspaceId, pull.id)).posted} findings on #${pull.number}.`)}
          data-spec-pull-changes-request
        >
          Request changes
        </TipBtn>
        <TipBtn tooltip="Close the pull request with a comment that names your reason." disabled={busy} onClick={() => setRejecting(!rejecting)} data-spec-pull-reject>
          Reject
        </TipBtn>
      </div>
      {rejecting && (
        <div className="flex flex-wrap items-center" style={{ gap: 8 }} data-spec-pull-reject-row>
          <label className="text-xs" htmlFor={`reject-${pull.id}`}>
            Reason
          </label>
          <input id={`reject-${pull.id}`} value={reason} onChange={(event) => setReason(event.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'inherit' }} />
          <DangerBtn
            label={`Reject ${pull.repository} #${pull.number}`}
            disabled={busy || !reason.trim()}
            confirm={{ title: `Reject #${pull.number}?`, body: `Avoozl comments "${reason.trim()}" and closes the pull request. The draft revision stays.`, action: 'Reject pull request' }}
            onConfirm={() => void act(async () => (await client.reject(workspaceId, pull.id, reason.trim()), `Closed #${pull.number}.`))}
          >
            Reject pull request
          </DangerBtn>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-danger">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="m-0 text-muted">
          {note}
        </p>
      )}
    </div>
  )
}

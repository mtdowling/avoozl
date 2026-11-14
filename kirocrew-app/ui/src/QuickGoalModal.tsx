// Quick goal (RC9, RC13, mockup 05-quick-goal.html). Ask, investigate,
// proposal, confirm. Nothing reaches GitHub before the confirm step's
// button; Edit, Promote and Discard never write to GitHub. The scope
// statement and the one-pull-request hint come from src/work-split.mjs.
import { useEffect, useState } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import { SCOPE_RULE, SCOPE_STATEMENT } from '../../../src/work-split.mjs'
import Badge from './Badge.tsx'
import { Modal } from './Modal.tsx'
import {
  DEFAULT_BUDGET,
  DEPTH_TEXT,
  PROMOTE_TEXT,
  approvedText,
  endedText,
  evidenceText,
  isEnded,
  quickGoalClient,
  waitsOn,
  type Confirm,
  type Depth,
  type QuickGoal,
} from './quickgoal-api.ts'
import { errorMessage } from './workspace-api.ts'

type Client = ReturnType<typeof quickGoalClient>
type Step = 'ask' | 'working' | 'proposal' | 'edit' | 'confirm' | 'done'

const FIELD = 'rounded border px-2 py-1 text-sm'

export function QuickGoalModal(props: { workspaceId: string; client: Client; onClose: (note?: string) => void; onPromoted?: (spec: string) => void }) {
  const { workspaceId, client } = props
  const [step, setStep] = useState<Step>('ask')
  const [repositories, setRepositories] = useState<string[]>([])
  const [goal, setGoal] = useState('')
  const [repository, setRepository] = useState('')
  const [depth, setDepth] = useState<Depth>('look')
  const [turns, setTurns] = useState(String(DEFAULT_BUDGET.turns))
  const [minutes, setMinutes] = useState(String(DEFAULT_BUDGET.minutes))
  const [auto, setAuto] = useState(false)
  const [waiting, setWaiting] = useState<QuickGoal[]>([])
  const [state, setState] = useState<QuickGoal | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [drop, setDrop] = useState<Set<string>>(new Set())
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    client.repositories(workspaceId).then(
      (list) => {
        if (!live) return
        const names = list.items.flatMap((item) => (item.github ? [item.github] : []))
        setRepositories(names)
        setRepository((current) => current || names[0] || '')
      },
      () => undefined,
    )
    client.settings(workspaceId).then(
      (value) => live && setAuto(value.autoApprove),
      () => undefined,
    )
    client.waiting(workspaceId).then(
      (list) => live && setWaiting(list),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [client, workspaceId])
  const call = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const investigate = async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    setStep('working')
    try {
      const result = await client.propose(workspaceId, { goal, repository, depth, budget: { turns: Number(turns), minutes: Number(minutes) } })
      if (isEnded(result)) {
        setNote(endedText(result))
        setStep('ask')
      } else if (result.approval) {
        setState(result.approval)
        setStep('done')
      } else {
        setState(result)
        setStep('proposal')
      }
    } catch (caught) {
      setError(errorMessage(caught))
      setStep('ask')
    } finally {
      setBusy(false)
    }
  }
  const review = () =>
    call(async () => {
      if (!state) return
      setConfirm(await client.confirm(workspaceId, state.id))
      setStep('confirm')
    })
  const approve = (id: string | undefined = state?.id) =>
    call(async () => {
      if (!id) return
      setState(await client.approve(workspaceId, id))
      setStep('done')
    })
  const save = () =>
    call(async () => {
      if (!state) return
      setState(await client.edit(workspaceId, state.id, { remove: [...drop], titles }))
      setDrop(new Set())
      setTitles({})
      setStep('proposal')
    })
  const discard = () =>
    call(async () => {
      if (state) await client.discard(workspaceId, state.id)
      props.onClose('Discarded. Nothing was written.')
    })
  const promote = () =>
    call(async () => {
      if (!state) return
      const next = await client.promote(workspaceId, state.id)
      props.onPromoted?.(next.plan?.spec ?? '')
      props.onClose(`Promoted to spec ${next.plan?.spec}. Open it under Specs.`)
    })
  const proposal = state?.proposal
  const tooBig = (state?.promote.length ?? 0) > 0
  const label = step === 'ask' ? 'Quick goal' : step === 'working' ? 'Investigating' : step === 'done' ? 'Next' : step === 'confirm' ? 'Confirm' : 'Proposal'
  return (
    <Modal
      id="avoozl-quickgoal"
      width="52rem"
      title={label}
      backLabel="Close"
      attrs={{ 'data-quickgoal-dialog': step }}
      unsaved={step === 'ask' && goal.trim() !== '' && { title: 'Close the quick goal?', body: 'Nothing is written. The goal you typed is lost.', action: 'Close' }}
      onDismiss={() => props.onClose(step === 'done' ? undefined : 'Closed. Nothing was written.')}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {step === 'ask' && (
            <>
              <Btn onClick={() => props.onClose('Closed. Nothing was written.')}>Cancel</Btn>
              <Btn onClick={() => void investigate()} disabled={busy || !goal.trim() || !repository}>
                Investigate
              </Btn>
            </>
          )}
          {step === 'working' && <Btn onClick={() => props.onClose('Closed. Nothing was written.')}>Close</Btn>}
          {step === 'proposal' && state && (
            <>
              <Btn onClick={() => void discard()} disabled={busy}>
                Discard
              </Btn>
              <Btn onClick={() => setStep('edit')} disabled={busy}>
                Edit
              </Btn>
              <Btn onClick={() => void promote()} disabled={busy}>
                Promote to spec
              </Btn>
              {!tooBig && (
                <Btn onClick={() => void review()} disabled={busy}>
                  Approve…
                </Btn>
              )}
            </>
          )}
          {step === 'edit' && (
            <>
              <Btn onClick={() => setStep('proposal')} disabled={busy}>
                Cancel
              </Btn>
              <Btn onClick={() => void save()} disabled={busy || drop.size === proposal?.tasks.length}>
                Save changes
              </Btn>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Btn onClick={() => setStep('proposal')} disabled={busy}>
                Back
              </Btn>
              <Btn onClick={() => void approve()} disabled={busy}>
                Approve and open the pull request
              </Btn>
            </>
          )}
          {step === 'done' && <Btn onClick={() => props.onClose(undefined)}>Close</Btn>}
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-xs text-muted" data-scope>
          {SCOPE_STATEMENT} {SCOPE_RULE}
        </p>
        {error && (
          <p role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {note && <p role="status">{note}</p>}
        {step === 'ask' && (
          <div className="flex flex-col gap-3">
            {waiting.length > 0 && (
              <div data-waiting className="flex flex-col gap-1">
                <p className="font-medium">Waiting for the approval pull request</p>
                {waiting.map((item) => (
                  <span key={item.id} className="flex flex-wrap items-center gap-2">
                    <span className="break-words">
                      “{item.request.goal}” · #{item.pull?.number}
                    </span>
                    <Btn onClick={() => void approve(item.id)} disabled={busy}>
                      Check the merge
                    </Btn>
                  </span>
                ))}
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="font-medium">Goal</span>
              <textarea className={FIELD} rows={3} value={goal} placeholder="Make tests faster" onChange={(e) => setGoal(e.target.value)} />
              <span className="text-xs text-muted">One sentence. Avoozl quotes it word for word at the bottom of every issue.</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Repository</span>
              {repositories.length ? (
                <select className={FIELD} value={repository} onChange={(e) => setRepository(e.target.value)}>
                  {repositories.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              ) : (
                <input className={FIELD} value={repository} placeholder="owner/name" onChange={(e) => setRepository(e.target.value)} />
              )}
            </label>
            <fieldset className="flex flex-col gap-1 border-0 p-0">
              <legend className="font-medium">Depth</legend>
              {(Object.keys(DEPTH_TEXT) as Depth[]).map((key) => (
                <label key={key} className="flex items-start gap-2">
                  <input type="radio" name="avoozl-quickgoal-depth" checked={depth === key} onChange={() => setDepth(key)} style={{ marginTop: 3 }} />
                  <span>
                    <span className="font-medium">{DEPTH_TEXT[key].title}</span> <span className="text-muted">{DEPTH_TEXT[key].line}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-medium">Turns</span>
                <input className={FIELD} style={{ width: '6rem' }} inputMode="numeric" value={turns} onChange={(e) => setTurns(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Minutes</span>
                <input className={FIELD} style={{ width: '6rem' }} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </label>
            </div>
            <label className="flex items-start gap-2" data-auto-approve>
              <input
                type="checkbox"
                checked={auto}
                style={{ marginTop: 3 }}
                onChange={(e) => {
                  const next = e.target.checked
                  void call(async () => setAuto((await client.setAutoApprove(workspaceId, next)).autoApprove))
                }}
              />
              <span>
                Approve by itself when no promote rule fires <span className="text-muted">(off by default)</span>
              </span>
            </label>
            <p className="text-muted">Investigating writes nothing to GitHub.</p>
          </div>
        )}
        {step === 'working' && (
          <p role="status">
            The planner is reading {repository}. This can take up to {minutes} minutes. Nothing is written.
          </p>
        )}
        {(step === 'proposal' || step === 'edit') && state && proposal && (
          <div className="flex flex-col gap-3" data-proposal>
            <p className="text-muted">
              {proposal.tasks.length} task{proposal.tasks.length === 1 ? '' : 's'}, {proposal.levels} level{proposal.levels === 1 ? '' : 's'}. “{state.request.goal}”
            </p>
            {state.hint && (
              <p data-hint className="flex flex-wrap items-center gap-2">
                <Badge variant="info">small</Badge> {state.hint.text}
                <Btn onClick={() => void review()} disabled={busy || step === 'edit'}>
                  {state.hint.action}
                </Btn>
              </p>
            )}
            {tooBig && (
              <div data-promote>
                <p>
                  <Badge variant="warning">too big for a quick goal</Badge> Promote it to a spec instead.
                </p>
                <ul className="list-disc pl-5">
                  {state.promote.map((rule) => (
                    <li key={rule}>{PROMOTE_TEXT[rule] ?? rule}</li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="flex flex-col gap-2" data-tasks>
              {proposal.tasks.map((task) => (
                <li key={task.id} className="flex flex-col gap-0.5 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                  {step === 'edit' ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Remove ${task.id}`}
                        checked={drop.has(task.id)}
                        onChange={() => setDrop(new Set(drop.has(task.id) ? [...drop].filter((id) => id !== task.id) : [...drop, task.id]))}
                      />
                      <code>{task.id}</code>
                      <input
                        className={FIELD}
                        style={{ flex: '1 1 12rem' }}
                        aria-label={`Title of ${task.id}`}
                        value={titles[task.id] ?? task.title}
                        disabled={drop.has(task.id)}
                        onChange={(e) => setTitles({ ...titles, [task.id]: e.target.value })}
                      />
                    </span>
                  ) : (
                    <span className="break-words">
                      <code>{task.id}</code> {task.title}
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {evidenceText(task)}
                    {waitsOn(proposal, task.id).length > 0 && ` · after ${waitsOn(proposal, task.id).join(', ')}`}
                  </span>
                </li>
              ))}
            </ul>
            {proposal.risks.length > 0 && <p className="text-muted">Risks: {proposal.risks.join(' ')}</p>}
            {proposal.questions.length > 0 && <p className="text-muted">Questions: {proposal.questions.map((q) => q.text).join(' ')}</p>}
          </div>
        )}
        {step === 'confirm' && confirm && (
          <div data-confirm className="flex flex-col gap-2">
            <p>
              Avoozl will open one approval pull request in <code>{confirm.repository}</code> for the spec <code>{confirm.spec}</code>. After it merges, these {confirm.issues.length} issues are written:
            </p>
            <ul className="flex list-disc flex-col gap-0.5 pl-5">
              {confirm.issues.map((issue) => (
                <li key={issue.id} className="break-words">
                  <code>{issue.id}</code> {issue.title}
                  {issue.requires.length > 0 && <span className="text-muted"> · after {issue.requires.join(', ')}</span>}
                </li>
              ))}
            </ul>
            <p className="text-muted">Undo: close the pull request, or close the issues as not planned.</p>
          </div>
        )}
        {step === 'done' && state && (
          <p role="status" data-done>
            {approvedText(state)}
          </p>
        )}
      </div>
    </Modal>
  )
}

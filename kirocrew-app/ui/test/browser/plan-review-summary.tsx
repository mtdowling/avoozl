import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PlansView, { ApproveSpecDialog, ApproveSpecsDialog } from '../../src/PlansView.tsx'
import { NavHistoryProvider, APP_ATTR } from '../../src/NavHistory.tsx'
import { TaskDrawerProvider } from '../../src/TaskDrawer.tsx'
import { answer } from './stubs.tsx'
import type { BatchEntry, PlanReviewSummary, PlansClient, SpecPlan } from '../../src/plans-api.ts'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') ?? 'light'
const calls = ((window as unknown as { __reviewCalls: unknown[] }).__reviewCalls = [])
const hash = 'a'.repeat(64)
const summary = (state: string): PlanReviewSummary => ({
  state: state === 'older' ? 'done' : state as PlanReviewSummary['state'], reviewerModel: state === 'not-reviewed' ? null : 'fake-reviewer', revisionHash: state === 'not-reviewed' ? null : hash, current: state !== 'older', found: state === 'not-reviewed' ? 0 : 2, fixed: 0, forYou: state === 'not-reviewed' ? 0 : 2,
  note: state === 'skipped' ? 'The writer model is unknown.' : null,
  open: state === 'not-reviewed' || state === 'skipped' ? [] : [
    { id: `${state}-answered`, roundId: 'round', revisionHash: hash, current: state !== 'older', kind: 'wrong-reference', severity: 'important', file: 'design.md', line: 7, claim: 'The referenced helper does not exist.', evidence: 'Searched src/ at the recorded commit; no matching helper.', answer: { action: 'answered', text: 'The existing loader covers this case.', at: 'now' } },
    { id: `${state}-waiting`, roundId: 'round', revisionHash: hash, current: state !== 'older', kind: 'gap', severity: 'question', file: 'requirements.md', line: 3, claim: 'A needed error case has no acceptance.', evidence: 'Compared requirement 2 to the task criteria.', answer: null },
  ],
})
const states = ['done', 'older', 'running', 'skipped', 'not-reviewed']
const entries: BatchEntry[] = states.map((state) => ({ id: state, spec: `fixture-${state}`, title: `Fixture ${state}`, hash, batch: 1, tasks: 1, errors: 0, loop: false, needs: [], review: summary(state) }))
const reviews = new Map(entries.map((entry) => [entry.id, entry.review!]))
const client = {
  reviewSummary: async (_workspace: string, id: string) => reviews.get(id)!,
  closeReviewFinding: async (_workspace: string, id: string, disposition: string) => {
    calls.push({ operation: 'plan.review.dispose', id, disposition })
    for (const [planId, review] of reviews) {
      if (!review.open.some((finding) => finding.id === id)) continue
      reviews.set(planId, { ...review, forYou: review.forYou - 1, open: review.open.filter((finding) => finding.id !== id) })
    }
  },
  selection: async () => ({ ok: true, specs: entries, writes: 0, failures: [], missing: [] }),
  approve: async (_workspace: string, id: string, expectedHash: string) => { calls.push({ operation: 'plan.approve', id, expectedHash }); return { id, hash: expectedHash } },
  approveMany: async (_workspace: string, items: unknown) => { calls.push({ operation: 'plan.approveMany', items }); return { ok: true, failures: [] } },
} as unknown as PlansClient
// Both workspaces deliberately have the same IDs and hash: an approval must
// remain tied to the workspace in which the person opened it.
const sharedPlan = { id: 'shared-plan', spec: 'shared-spec', title: 'Shared fixture', hash, revision: 1, state: 'draft', review: summary('done'), approvals: [], files: {}, quality: { canApprove: true, counts: { error: 0, warning: 0, info: 0 }, diagnostics: [] }, disk: { changed: false, exists: true, folder: '.kiro/specs/shared-spec/', hash, critique: null } }
answer('plan.table', () => ({ root: '/fixture', specs: [], revision: 1, items: [{ key: 'spec:shared-spec', kind: 'spec', name: 'shared-spec', spec: 'shared-spec', planId: sharedPlan.id, folder: '.kiro/specs/shared-spec/', status: 'draft', tasks: { total: 1, done: 0 }, now: { ready: 0, running: 0, needsYou: 0 }, category: null, errors: 0 }] }))
answer('plan.get', () => sharedPlan)
answer('plan.preview', () => ({ reviewedHash: hash, expectedRevision: 1, tasks: [], dependencies: [] }))
answer('plan.approvalBatches', () => ({ batches: [] }))
answer('plan.reviewSummary', () => summary('done'))
answer('plan.approve', (body) => { calls.push(body); return { id: sharedPlan.id, hash } })
function WorkspaceHarness() {
  const [workspace, setWorkspace] = useState('first')
  ;(window as unknown as { __setReviewWorkspace: (id: string) => void }).__setReviewWorkspace = setWorkspace
  return <div {...{ [APP_ATTR]: '' }}><NavHistoryProvider><TaskDrawerProvider workspaceId={workspace} onFocus={() => undefined}><PlansView workspaceId={workspace} /></TaskDrawerProvider></NavHistoryProvider></div>
}
function Harness() {
  const [open, setOpen] = useState(true)
  const state = query.get('state') ?? 'done'
  const plan = { id: state, spec: `fixture-${state}`, title: 'Fixture', hash, review: reviews.get(state) } as SpecPlan
  const done = (text: string | null) => { calls.push({ done: text }); setOpen(false) }
  return <div {...{ [APP_ATTR]: '' }} style={{ background: 'var(--bg)', color: 'var(--text)' }}><NavHistoryProvider>{open ? query.get('mode') === 'batch' ? <ApproveSpecsDialog workspaceId="w" entries={entries} client={client} onDone={done} /> : <ApproveSpecDialog workspaceId="w" plan={plan} client={client} onDone={done} /> : <p data-dialog-closed>Closed</p>}</NavHistoryProvider></div>
}
createRoot(document.getElementById('root')!).render(query.get('mode') === 'workspace' ? <WorkspaceHarness /> : <Harness />)

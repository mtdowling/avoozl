import { PlanningFlow } from '../../src/PlanningFlow.tsx'
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
const oldHash = 'b'.repeat(64)
const movedHash = 'c'.repeat(64)
const OLD_FILES = { 'requirements.md': '# Fixture\nOld goal.\n', 'tasks.md': '- [ ] 1.1 Task\n' }
const FILES = { 'requirements.md': '# Fixture\nNew goal.\n', 'tasks.md': '- [ ] 1.1 Task\n' }
const MOVED_FILES = { 'requirements.md': '# Fixture\nNewer goal.\n', 'tasks.md': '- [ ] 1.1 Task\n- [ ] 1.2 Error case\n' }
// Each plan's stored revision now; a test moves one with __moveRevision.
const current = new Map<string, string>()
const hashOf = (id: string) => current.get(id) ?? hash
const summary = (state: string, at = hash): PlanReviewSummary => {
  const none = state === 'not-reviewed', listed = !none && state !== 'skipped', movedOn = at === movedHash
  return {
    state: state === 'older' ? 'done' : state as PlanReviewSummary['state'], planHash: at, reviewerModel: none ? null : 'fake-reviewer', revisionHash: none ? null : hash, current: state !== 'older', found: none ? 0 : 2, fixed: movedOn ? 1 : 0, forYou: none ? 0 : movedOn ? 1 : 2,
    bySeverity: none ? { blocker: 0, warn: 0, info: 0 } : { blocker: 0, warn: 1, info: 1 },
    byState: none ? {} : movedOn ? { 'for you': 1, fixed: 1 } : { 'for you': 2 },
    canReviewAnyway: state === 'skipped',
    note: state === 'skipped' ? 'The writer model is unknown.' : null,
    open: !listed ? [] : [
      { id: `${state}-answered`, roundId: 'round', revisionHash: hash, current: state !== 'older', kind: 'wrong-reference', severity: 'warn', state: 'for you', anchor: { file: 'design.md', lineStart: 7, lineEnd: 7, moved: movedOn }, file: 'design.md', line: 7, claim: 'The referenced helper does not exist.', evidence: 'Searched src/ at the recorded commit; no matching helper.', answer: { action: 'answered', text: 'The existing loader covers this case.', at: 'now' } },
      { id: `${state}-waiting`, roundId: 'round', revisionHash: hash, current: state !== 'older', kind: 'gap', severity: 'info', state: movedOn ? 'fixed' : 'for you', anchor: { file: 'requirements.md', lineStart: 3, lineEnd: 3 }, file: 'requirements.md', line: 3, claim: 'A needed error case has no acceptance.', evidence: 'Compared requirement 2 to the task criteria.', answer: movedOn ? { action: 'fixed', revisionHash: movedHash, text: 'Added task 1.2.', at: 'now' } : null },
    ],
  }
}
const states = ['done', 'older', 'running', 'skipped', 'not-reviewed']
const entries: BatchEntry[] = states.map((state) => ({ id: state, spec: `fixture-${state}`, title: `Fixture ${state}`, hash, batch: 1, tasks: 1, errors: 0, loop: false, needs: [], review: summary(state) }))
const reviews = new Map(entries.map((entry) => [entry.id, entry.review!]))
// A pass at its rounds cap: the round reviewed an older revision (R104.14).
reviews.set('capped', { ...summary('older'), canReviewAnyway: true, capped: true })
;(window as unknown as { __summaryReads: string[] }).__summaryReads = []
const win = window as unknown as { __settleRunning: (move?: boolean) => void; __moveRevision: (id: string) => void }
win.__settleRunning = (move = false) => {
  if (move) current.set('running', movedHash)
  reviews.set('running', { ...summary('done', hashOf('running')), found: 2, fixed: 1, forYou: 1 })
}
// The planner writes a new revision of one spec while the dialog is open:
// one finding becomes fixed and one moves.
win.__moveRevision = (id: string) => {
  current.set(id, movedHash)
  reviews.set(id, summary(reviews.get(id)?.state === 'skipped' ? 'skipped' : 'done', movedHash))
}
const filesOf = (id: string) => (hashOf(id) === movedHash ? MOVED_FILES : FILES)
const history = [{ revision: 1, hash: oldHash, files: OLD_FILES }, { revision: 2, hash, files: FILES }]
// The real client returns {changed} for a revision that moved; this fake does the same.
const client = {
  get: async (_workspace: string, id: string) => { calls.push({ operation: 'plan.get', id }); return { id, spec: `fixture-${id}`, title: 'Fixture', hash: hashOf(id), files: filesOf(id), approvals: [], history, review: reviews.get(id) } },
  reviewAnyway: async (workspaceId: string, planId: string, revisionHash: string) => { calls.push({operation: 'plan.review.decide',workspaceId,planId,revisionHash,action:'review',unproven:true}); return {} },
  reviewSummary: async (_workspace: string, id: string) => { (window as unknown as { __summaryReads: string[] }).__summaryReads.push(id); return { ...reviews.get(id)!, planHash: hashOf(id) } },
  selection: async () => ({ ok: true, specs: entries.map((entry) => ({ ...entry, hash: hashOf(entry.id), tasks: hashOf(entry.id) === movedHash ? 2 : 1 })), writes: 0, failures: [], missing: [] }),
  approve: async (_workspace: string, id: string, expectedHash: string) => {
    if (hashOf(id) !== expectedHash) { calls.push({ operation: 'plan.preview', id }); return { changed: { reviewedHash: hashOf(id), expectedRevision: 2, tasks: [], dependencies: [] } } }
    calls.push({ operation: 'plan.approve', id, expectedHash }); return { id, hash: expectedHash }
  },
  approveMany: async (_workspace: string, items: { id: string; expectedHash: string }[]) => {
    const changed = items.filter((item) => hashOf(item.id) !== item.expectedHash)
    if (changed.length) { calls.push({ operation: 'plan.preview', ids: changed.map((item) => item.id) }); return { ok: false, failures: [], changed: changed.map((item) => ({ id: item.id, preview: { reviewedHash: hashOf(item.id) } })) } }
    calls.push({ operation: 'plan.approveMany', items }); return { ok: true, failures: [] }
  },
} as unknown as PlansClient
// Both workspaces deliberately have the same IDs and hash: an approval must
// remain tied to the workspace in which the person opened it.
const sharedPlan = { id: 'shared-plan', spec: 'shared-spec', title: 'Shared fixture', hash, revision: 1, state: 'draft', review: summary('done'), approvals: [], files: {}, quality: { canApprove: true, counts: { error: 0, warning: 0, info: 0 }, diagnostics: [] }, disk: { changed: false, exists: true, folder: '.kiro/specs/shared-spec/', hash, critique: null } }
answer('plan.table', () => ({ root: '/fixture', specs: [], revision: 1, items: [{ key: 'spec:shared-spec', kind: 'spec', name: 'shared-spec', spec: 'shared-spec', planId: sharedPlan.id, folder: '.kiro/specs/shared-spec/', status: 'draft', tasks: { total: 1, done: 0 }, now: { ready: 0, running: 0, needsYou: 0 }, category: null, errors: 0 }] }))
answer('plan.get', () => sharedPlan)
answer('plan.preview', () => ({ reviewedHash: hash, expectedRevision: 1, tasks: [], dependencies: [] }))
const sharedEntry = {id:sharedPlan.id,spec:sharedPlan.spec,title:sharedPlan.title,hash,batch:1,tasks:1,errors:0,loop:false,needs:[],review:summary('skipped')}
answer('plan.approvalBatches', () => query.get('mode') === 'workspace-batch' ? {batches:[{batch:1,specs:[sharedEntry]}],selection:{ok:true,specs:[sharedEntry],writes:0,failures:[],missing:[]}} : { batches: [] })
answer('plan.review.decide',(body) => {calls.push(body);return {}})
// The same review the batch entry carries, as the backend would read it.
answer('plan.reviewSummary', () => summary(query.get('mode') === 'workspace-batch' ? 'skipped' : 'done'))
answer('plan.approve', (body) => { calls.push(body); return { id: sharedPlan.id, hash } })
function WorkspaceHarness() {
  const [workspace, setWorkspace] = useState('first')
  ;(window as unknown as { __setReviewWorkspace: (id: string) => void }).__setReviewWorkspace = setWorkspace
  return <div {...{ [APP_ATTR]: '' }}><NavHistoryProvider><TaskDrawerProvider workspaceId={workspace} onFocus={() => undefined}><PlansView workspaceId={workspace} /></TaskDrawerProvider></NavHistoryProvider></div>
}
function Harness() {
  const [open, setOpen] = useState(true)
  const state = query.get('state') ?? 'done'
  const plan = { id: state, spec: `fixture-${state}`, title: 'Fixture', hash, review: reviews.get(state), files: FILES, approvals: [{ id: 'a1', hash: oldHash, at: 'then', approvedBy: 'person' }], history: [{ revision: 1, hash: oldHash, files: OLD_FILES }] } as SpecPlan
  const done = (text: string | null) => { calls.push({ done: text }); setOpen(false) }
  const openReview = (planId: string, rev: string) => { calls.push({ openReview: planId, rev }); setOpen(false) }
  return <div {...{ [APP_ATTR]: '' }} style={{ background: 'var(--bg)', color: 'var(--text)' }}><NavHistoryProvider>{open ? query.get('mode') === 'batch' ? <ApproveSpecsDialog workspaceId="w" entries={entries} client={client} onDone={done} onOpenReview={openReview} /> : <ApproveSpecDialog workspaceId="w" plan={plan} client={client} onDone={done} onOpenReview={openReview} /> : <p data-dialog-closed>Closed</p>}</NavHistoryProvider></div>
}
createRoot(document.getElementById('root')!).render(query.get('mode') === 'planning' ? <div {...{[APP_ATTR]: ''}}><PlanningFlow groups={[{spec:'synthetic-spec',planId:'p',durationMs:180000,usage:{input:20,output:10,credits:4,turns:2},roles:[{role:'plan-review',model:'fake-reviewer',durationMs:60000,input:10,output:5,credits:2,turns:1},{role:'plan-answer',model:'fake-writer',durationMs:120000,input:10,output:5,credits:2,turns:1}]}]} /></div> : query.get('mode')?.startsWith('workspace') ? <WorkspaceHarness /> : <Harness />)

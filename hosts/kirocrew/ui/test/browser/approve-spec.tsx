import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PlansView, { ApproveSpecDialog } from '../../src/PlansView.tsx'
import { NavHistoryProvider, APP_ATTR } from '../../src/NavHistory.tsx'
import { TaskDrawerProvider } from '../../src/TaskDrawer.tsx'
import { answer } from './stubs.tsx'
import type { PlansClient, SpecPlan } from '../../src/plans-api.ts'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') ?? 'light'
const calls = ((window as unknown as { __approveCalls: unknown[] }).__approveCalls = [])
const hash = 'a'.repeat(64)
const oldHash = 'b'.repeat(64)
const movedHash = 'c'.repeat(64)
const OLD_FILES = { 'requirements.md': '# Fixture\nOld goal.\n', 'tasks.md': '- [ ] 1.1 Task\n' }
const FILES = { 'requirements.md': '# Fixture\nNew goal.\n', 'tasks.md': '- [ ] 1.1 Task\n' }
const MOVED_FILES = { 'requirements.md': '# Fixture\nNewer goal.\n', 'tasks.md': '- [ ] 1.1 Task\n- [ ] 1.2 Error case\n' }
// Each plan's stored revision now; a test moves one with __moveRevision.
const current = new Map<string, string>()
const hashOf = (id: string) => current.get(id) ?? hash
// The planner writes a new revision of one spec while the dialog is open.
;(window as unknown as { __moveRevision: (id: string) => void }).__moveRevision = (id: string) => current.set(id, movedHash)
const filesOf = (id: string) => (hashOf(id) === movedHash ? MOVED_FILES : FILES)
const history = [
  { revision: 1, hash: oldHash, files: OLD_FILES },
  { revision: 2, hash, files: FILES },
]
// The real client returns {changed} for a revision that moved; this fake does the same.
const client = {
  get: async (_workspace: string, id: string) => ({ id, spec: `fixture-${id}`, title: 'Fixture', hash: hashOf(id), files: filesOf(id), approvals: [], history }),
  approve: async (_workspace: string, id: string, expectedHash: string) => {
    if (hashOf(id) !== expectedHash) {
      calls.push({ operation: 'plan.preview', id })
      return { changed: { reviewedHash: hashOf(id), expectedRevision: 2, tasks: [], dependencies: [] } }
    }
    calls.push({ operation: 'plan.approve', id, expectedHash })
    return { id, hash: expectedHash }
  },
} as unknown as PlansClient
// Both workspaces deliberately have the same IDs and hash: an approval must
// remain tied to the workspace in which the person opened it.
const sharedPlan = {
  id: 'shared-plan',
  spec: 'shared-spec',
  title: 'Shared fixture',
  hash,
  revision: 1,
  state: 'draft',
  approvals: [],
  files: {},
  quality: { canApprove: true, counts: { error: 0, warning: 0, info: 0 }, diagnostics: [] },
  disk: { changed: false, exists: true, folder: '.kiro/specs/shared-spec/', hash, critique: null },
}
answer('plan.table', () => ({
  root: '/fixture',
  specs: [],
  revision: 1,
  items: [
    {
      key: 'spec:shared-spec',
      kind: 'spec',
      name: 'shared-spec',
      spec: 'shared-spec',
      planId: sharedPlan.id,
      folder: '.kiro/specs/shared-spec/',
      status: 'draft',
      tasks: { total: 1, done: 0 },
      now: { ready: 0, running: 0, needsYou: 0 },
      category: null,
      errors: 0,
    },
  ],
}))
answer('plan.get', () => sharedPlan)
answer('plan.preview', () => ({ reviewedHash: hash, expectedRevision: 1, tasks: [], dependencies: [] }))
answer('plan.approve', (body) => {
  calls.push(body)
  return { id: sharedPlan.id, hash }
})
function WorkspaceHarness() {
  const [workspace, setWorkspace] = useState('first')
  ;(window as unknown as { __setWorkspace: (id: string) => void }).__setWorkspace = setWorkspace
  return (
    <div {...{ [APP_ATTR]: '' }}>
      <NavHistoryProvider>
        <TaskDrawerProvider workspaceId={workspace} onFocus={() => undefined}>
          <PlansView workspaceId={workspace} />
        </TaskDrawerProvider>
      </NavHistoryProvider>
    </div>
  )
}
function Harness() {
  const [open, setOpen] = useState(true)
  const plan = {
    id: 'spec',
    spec: 'fixture-spec',
    title: 'Fixture',
    hash,
    files: FILES,
    approvals: [{ id: 'a1', hash: oldHash, at: 'then', approvedBy: 'person' }],
    history: [{ revision: 1, hash: oldHash, files: OLD_FILES }],
  } as SpecPlan
  const done = (text: string | null) => {
    calls.push({ done: text })
    setOpen(false)
  }
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <NavHistoryProvider>{open ? <ApproveSpecDialog workspaceId="w" plan={plan} client={client} onDone={done} /> : <p data-dialog-closed>Closed</p>}</NavHistoryProvider>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(query.get('mode') === 'workspace' ? <WorkspaceHarness /> : <Harness />)

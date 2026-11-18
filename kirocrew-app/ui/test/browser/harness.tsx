// The modal harness page: one Avoozl modal at a time (?modal=<name>) on a
// page shaped like the host's. A fixed host header with a high z-index, a
// scroll pane with a transform (a containing block), a sticky column, the
// real Graph, and the modal's opener inside a card that is also a
// containing block. ?theme=light|dark sets the host theme attribute.
import { Component, useState, type ReactNode } from 'react'
import { FilterPanel } from '../../src/FilterPanel.tsx'
import ConflictsView from '../../src/ConflictsView.tsx'
import { IconBtn } from '../../src/controls.tsx'
import { RefreshCw } from '../../src/icons.ts'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { answer, Btn, Card, Refusal, replyFor, useAppApi } from './stubs.tsx'
import { NavHistoryProvider, APP_ATTR } from '../../src/NavHistory.tsx'
import { ConfirmProvider, DangerBtn, InfoTip } from '../../src/controls.tsx'
import { Tooltip } from '../../src/Tooltip.tsx'
import { TaskDrawerProvider } from '../../src/TaskDrawer.tsx'
import GraphView from '../../src/GraphView.tsx'
import AddPlugin from '../../src/AddPlugin.tsx'
import Onboard from '../../src/Onboard.tsx'
import { Modal } from '../../src/Modal.tsx'
import { installInlineFixture } from './settings-inline-fixture.ts'
import { SetupDialog } from '../../src/SetupWizard.tsx'
import PlansView, { ArchivePlanDialog, DeletePlanDialog } from '../../src/PlansView.tsx'
import { DocumentReader } from '../../src/DocumentReader.tsx'
import { StopLineButton } from '../../src/StopLine.tsx'
import WorkspaceView from '../../src/WorkspaceView.tsx'
import { PackImportDialog } from '../../src/PackImport.tsx'
import { SendToRadar } from '../../src/SendToRadar.tsx'
import ActivityView from '../../src/ActivityView.tsx'
import DashboardView, { InFlightRow } from '../../src/DashboardView.tsx'
import { setupForm } from '../../src/settings-api.ts'
import { LAYER } from '../../src/layers.ts'
import { CoderPicker } from '../../src/CoderPicker.tsx'
import { GateList } from '../../src/TrackerGates.tsx'
import { waitingGates, type GateRow } from '../../src/release-api.ts'
import ReleaseQueue from '../../src/ReleaseQueue.tsx'
import GithubFlow from '../../src/GithubFlow.tsx'
import { ReleaseModePicker } from '../../src/ReleaseMode.tsx'
import { ProjectionModal } from '../../src/ProjectionModal.tsx'
import { SpecChangedModal } from '../../src/SpecChangedModal.tsx'
import { projectionClient } from '../../src/projection-api.ts'
import PluginsSettings from '../../src/PluginsSettings.tsx'
import SettingsView, { RateBlock, RepositoryEditor } from '../../src/SettingsView.tsx'
import { answerIntake } from './intake-fixture.ts'
import { chainsGraph, draftsGraph } from './graph-chains.ts'
import RadarValuesScreen from '../../src/RadarValues.tsx'
import { ForwardScreen } from '../../src/ForwardScreen.tsx'
import forwardLive from './forward-live-replies.json'
import { CrewsRulesSettings } from '../../src/CrewsRulesSettings.tsx'
import { emptyRepository, type RepositoryForm } from '../../src/settings-api.ts'
import WorkflowMap, { focusField } from '../../src/WorkflowMap.tsx'
import { toForm } from '../../src/settings-api.ts'
import AvoozlApp from '../../src/App.tsx'
import { MarkDoneDialog } from '../../src/TaskNotes.tsx'
import { reviewFixture } from './review-fixture.ts'
import NewPlanDrawer from '../../src/NewPlanDrawer.tsx'
import { useTaskDrawer } from '../../src/drawer-context.ts'
import AvoozlPanel from '../../src/Panel.tsx'
import ModelsSettings from '../../src/ModelsSettings.tsx'
import { TaskFiles } from '../../src/TaskFiles.tsx'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const state = ((window as unknown as { __harness: { closed: number; calls: { operation?: string; input?: unknown }[] } }).__harness = { closed: 0, calls: [] })

// A client whose every call never settles: dialogs stay on their first step.
const idle = new Proxy({}, { get: () => () => new Promise(() => undefined) }) as never

const task = (id: string, epic: string, extra = {}) => ({
  id,
  title: `Task ${id}`,
  epic,
  kind: 'leaf',
  authority: 'local',
  route: 'local',
  completion: 'integrated',
  repository: null,
  status: 'planned',
  complete: false,
  ready: id === 'a1',
  decision: null,
  issue: null,
  ...extra,
})
const tasks = [task('a1', 'e1'), task('a2', 'e1'), task('a3', 'e1'), task('b1', 'e2'), task('b2', 'e2'), task('b3', 'e2')]
answer('graph.view', () => ({
  revision: 1,
  epics: [
    { id: 'e1', title: 'First epic', count: 3 },
    { id: 'e2', title: 'Second epic', count: 3 },
  ],
  statuses: [{ id: 'planned', label: 'Planned', complete: false }],
  repositories: [],
  total: tasks.length,
  tasks,
  edges: [
    { from: 'a1', to: 'a2', kind: 'requires', blocking: true, satisfied: false },
    { from: 'a2', to: 'a3', kind: 'requires', blocking: true, satisfied: false },
    { from: 'a1', to: 'b1', kind: 'requires', blocking: true, satisfied: false },
    { from: 'b1', to: 'b2', kind: 'sequence', blocking: false, satisfied: false },
    { from: 'b2', to: 'b3', kind: 'requires', blocking: true, satisfied: false },
  ],
}))


// Project to GitHub and Spec changed: sample replies. Every call is recorded
// in __harness.calls so a test can see what was written and when.
const write = (kind: string, taskId: string | null, extra = {}) => ({ kind, repository: 'example/recipe-box', taskId, issue: null, ...extra })
answer('plan.issues.preview', (body) => {
  state.calls.push(body)
  const batched = ((body.input as { batches?: string[][] }).batches ?? []).length > 0
  const ids = ['S1', 'S2', 'S3', 'S7', 'S8']
  return {
    planId: 'search-v2', planHash: 'h', conflicts: [], notes: ['Project fields: Release "search-v2", Wave 1 to 3.'], previewOnly: [], project: { status: 'ok' },
    simulated: false,
    // 927 issues, their sub-issue and blocked-by links, at the default pace.
    pace: { writes: 1813, perMinute: 60, perHour: 400, finishAt: '2026-11-15T14:04:00.000Z', minutes: 244 },
    suggestedBatches: [['S1', 'S2', 'S3']],
    writes: [
      ...ids.filter((id) => !(batched && ['S2', 'S3'].includes(id))).map((id) => write('issue.create', id, { title: `Task ${id}: a title long enough to wrap on a narrow screen` })),
      write('blocker.add', 'S8', { blockerTaskId: 'S7' }),
      ...ids.map((id) => write('project.add', id)),
      write('label.add', 'S1', { labels: ['ready'] }),
    ],
  }
})
answer('github.project', (body) => {
  state.calls.push(body)
  return { projected: ['search-v2'] }
})
const changeRow = (taskId: string, title: string, change: string, issueState: string, action: string, text: string, number: number | null) => ({ taskId, title, change, issueState, action, text, number, repository: 'example/recipe-box' })
answer('spec.changed.preview', (body) => {
  state.calls.push(body)
  return {
    planId: 'search-v2', hash: 'h2', approved: query.get('approved') !== '0', applied: null,
    rows: [
      changeRow('S8', 'Ranking: acceptance edited', 'edited', 'unclaimed', 'update', 'Update the issue body and the approval hash.', 54),
      changeRow('S5', 'Index builder: new step', 'edited', 'claimed', 'comment', 'Do not edit. Comment that the spec changed.', 52),
      changeRow('S14', 'Telemetry', 'added', 'none', 'create', 'Create the issue.', null),
      changeRow('S12', 'Docs', 'removed', 'unclaimed', 'close', 'Close as not planned.', 58),
    ],
  }
})
answer('spec.changed.apply', (body) => {
  state.calls.push(body)
  return { planId: 'search-v2', done: [] }
})
const projections = projectionClient(useAppApi() as never)

const row = { key: 'p1', kind: 'spec', name: 'Modal plan', spec: 'modal-plan', folder: '.kiro/specs/modal-plan', planId: 'modal-plan', type: 'feature', category: null, categoryProblem: null, errors: 0, status: 'approved', tasks: { total: 3, done: 1 }, now: { ready: 1, running: 0, needsYou: 0 }, epics: 1, lastChange: null }
const text = ['# Guide', '', 'A short file for the viewer.', '', '## Part one', '', 'Some words.', '', '## Part two', '', 'More words.'].join('\n')

// A manual task waiting for a person, with links (R61).
answer('task.detail', () => ({
  revision: 1,
  task: {
    id: 'team-review', title: 'Review with team', summary: 'The team reviews the results before cutover.',
    acceptance: ['The team agreed the runtime and protocol results are good enough to cut over'], checks: ['npm run test:protocol'],
    epic: null, epicTitle: null, phase: { id: 'review', title: 'Review' }, kind: 'leaf', authority: 'github', route: 'github',
    completion: 'person', repository: 'sdk', status: 'planned', state: 'needs-you', ready: false, needsReview: false, decision: null,
    owner: null, issue: { number: 47, url: 'https://github.example.test/o/sdk/issues/47', repository: 'o/sdk' }, wave: 5, context: '',
    manual: true, manualDone: null, onGitHub: true,
  },
  plan: null, locked: null,
  waitsOn: [{ id: 'protocol-tests', title: 'Protocol tests', kind: 'requires', condition: null, satisfied: true }],
  blocks: [{ id: 'cutover', title: 'Cutover', kind: 'requires', condition: null, satisfied: false }],
  delivery: null, conflicts: [],
  timeline: [
    { at: '2026-11-13T10:05:00Z', text: 'Waiting for a person: Review with team' },
    { at: '2026-11-13T09:00:00Z', text: 'Protocol tests finished' },
  ],
  timing: null,
  steps: [
    { key: 'spec', label: 'Spec approved', at: '2026-11-13T08:00:00Z', state: 'done', by: 'owner' },
    { key: 'ready', label: 'Ready', at: null, state: 'skipped' },
    { key: 'started-1', label: 'Started (attempt 1)', at: '2026-11-13T08:10:00Z', state: 'done', by: 'model-a', detail: 'worker' },
    { key: 'failed-1', label: 'Attempt 1 failed', at: '2026-11-13T08:40:00Z', state: 'done', failed: true, detail: 'tests red' },
    { key: 'started-2', label: 'Started (attempt 2)', at: '2026-11-13T09:00:00Z', state: 'done', detail: 'worker' },
    { key: 'checks', label: 'Checks', at: '2026-11-13T09:30:00Z', state: 'done', detail: '2 passed' },
    { key: 'landed', label: 'Landed', at: '2026-11-13T09:35:00Z', state: 'done', detail: 'Commit 0123456789ab' },
    { key: 'builds', label: 'Builds', at: '2026-11-13T09:32:00Z', state: 'done', detail: '2 builds, 2 min in all · costliest test 1.5 min', builds: [{ phase: 'build', items: [{ target: 'linux-x64/node26', start: 'warm', attempt: 1, task: 'team-review', ms: 38000, failed: false }] }, { phase: 'test', items: [{ target: 'linux-x64/node26', start: 'warm', attempt: 1, task: 'team-review', ms: 90000, failed: true }] }] },
    { key: 'integrated', label: 'Integrated', at: null, state: 'now' },
  ],
}))
answer('task.evidence', () => ({
  taskId: 'team-review',
  entries: [{ id: 'ev-1', kind: 'check', at: '2026-11-13T09:00:00Z', source: 'session:chat-1', text: 'npm run test:protocol passed' }],
}))
answer('task.notes.list', () => ({
  taskId: 'team-review',
  entries: [
    { id: 'note-000000000002', taskId: 'team-review', kind: 'link', label: 'Protocol test results', url: 'https://docs.example.test/results', outcome: false, author: 'session:chat-1', at: '2026-11-13T10:05:00Z', onIssue: false },
    { id: 'note-000000000001', taskId: 'team-review', kind: 'link', label: 'Review agenda', url: 'https://docs.example.test/agenda', outcome: false, author: 'person', login: 'alice', at: '2026-11-13T09:00:00Z', onIssue: true },
  ],
}))
answer('task.notes.add', (body) => {
  state.calls.push(body)
  const input = body.input as { taskId: string; url: string; label: string }
  return { id: 'note-000000000003', taskId: input.taskId, kind: 'link', url: input.url, label: input.label, outcome: false, author: 'person', at: '2026-11-13T11:00:00Z', onIssue: false }
})
answer('repositories.list', () => ({ items: [{ id: 'sdk', name: 'sdk', localCheckout: '/w/sdk', github: 'o/sdk', baseBranch: 'main' }] }))
answer('template.list', () => ({
  templates: [
    {
      plugin: 'sdk-templates', version: '1.0.0', id: 'sdk-rewrite', title: 'SDK rewrite',
      description: 'Rewrite one SDK on the new runtime, phase by phase, with a team review before cutover.',
      inputs: [
        { id: 'sdk', label: 'Which SDK', type: 'text', required: true },
        { id: 'repository', label: 'Target repository', type: 'repositories', required: true },
        { id: 'gaps', label: 'Gap list', type: 'file', required: false },
      ],
      phases: ['Inventory', 'Codegen', 'Runtime', 'Protocol tests', 'Review', 'Cutover'].map((title) => ({ id: title.toLowerCase(), title })),
      proofKinds: ['Protocol tests pass', 'Cutover dry run'], settings: true,
    },
  ],
}))
answer('plugin.pack.preview', () => ({
  id: 'sdk-templates', version: '1.0.0', description: 'SDK rewrite settings', repositories: [], warnings: [], previewHash: 'h', imported: null,
  changes: [
    { setting: 'flow.batch', action: 'create', to: { by: 'phase', max: 3 } },
    { setting: 'flow.retro.everyTasks', action: 'change', from: 20, to: 10 },
    { setting: 'flow.localChecksFirst', action: 'keep', to: true },
  ],
}))

function OpenTask() {
  const drawer = useTaskDrawer()
  return (
    <Btn type="button" onClick={() => drawer.openTask('team-review')}>
      Open the dialog
    </Btn>
  )
}

// Review info from Needs you: a review group of two tasks.
function OpenReview() {
  const drawer = useTaskDrawer()
  const group = { key: 'g1', kind: 'review', taskId: null, title: 'Meal planner: sections changed', detail: 'Two tasks changed.', plan: 'meal-planner', epic: null, repository: null, since: '2026-11-14T10:00:00Z', tasks: [{ id: 'team-review', title: 'Review with team', status: 'planned' }, { id: 'cutover', title: 'Cutover', status: 'planned' }] }
  return (
    <Btn type="button" onClick={() => drawer.openReview(group as never)}>
      Open the dialog
    </Btn>
  )
}

// Each modal: the label of the button that opens it, and what it renders.
type Scenario = { opener: string; render: (open: boolean, setOpen: (open: boolean) => void, close: () => void) => ReactNode }
const own = (opener: string, node: ReactNode): Scenario => ({ opener, render: () => node })
const shown = (dialog: (close: () => void) => ReactNode): Scenario => ({
  opener: 'Open the dialog',
  render: (open, setOpen, close) => (
    <>
      <Btn type="button" onClick={() => setOpen(true)}>
        Open the dialog
      </Btn>
      {open && dialog(close)}
    </>
  ),
})
// A dialog that asks before it discards edits (Modal's `unsaved`).
const repoEdit = (edited: boolean) =>
  shown((close) => (
    <Modal id="avoozl-repo-edit" width="46rem" title="avoozl" unsaved={edited && { title: 'Discard your changes to avoozl?', body: 'Every edit in this dialog is lost.', action: 'Discard changes' }} onDismiss={close}>
      <label className="flex flex-col gap-1 text-sm">
        Base branch
        <input defaultValue="main" className="rounded border px-2 py-1" />
      </label>
    </Modal>
  ))

export const SCENARIOS: Record<string, Scenario> = {
  'add-plugin': own('Add plugin', <AddPlugin workspaceId="w" client={idle} supported={[1]} onChanged={async () => undefined} />),
  onboard: own('Onboard', <Onboard workspaceId="w" disabled={null} onChanged={async () => undefined} />),
  'repo-edit': repoEdit(false),
  'repo-edit-unsaved': repoEdit(true),
  'setup-github': shown((close) => <SetupDialog workspaceId="w" client={idle} form={setupForm({})} set={() => undefined} first={null} onClose={close} onSaved={async () => undefined} />),
  'archive-plan': shown((close) => <ArchivePlanDialog workspaceId="w" row={row as never} client={idle} onDone={close} />),
  'delete-plan': shown((close) => <DeletePlanDialog workspaceId="w" row={row as never} client={idle} onDone={close} />),
  confirm: own(
    'Remove',
    <DangerBtn confirm={{ title: 'Remove avoozl?', body: 'Its settings go. The checkout stays.', action: 'Remove' }} onConfirm={() => undefined}>
      Remove
    </DangerBtn>,
  ),
  'file-viewer': shown((close) => <DocumentReader workspaceId="w" target={{ document: 'docs/guide.md', lineStart: null, lineEnd: null }} text={text} onClose={close} />),
  'stop-line': own('Stop the line', <StopLineButton workspaceId="w" onPulled={() => undefined} />),
  'pack-import': shown((close) => <PackImportDialog row={{ id: 'pack-1', version: '1.0.0' } as never} workspaceId="w" client={idle} onClose={close} onChanged={async () => undefined} />),
  'send-to-radar': shown((close) => <SendToRadar workspaceId="w" client={idle} items={[]} repository="avoozl" onClose={close} onSent={close} />),
  // Not a modal: the drawer's Files fold, at a drawer's width.
  'task-files': shown(() => (
    <div style={{ maxWidth: 620 }}>
      <TaskFiles workspaceId="w" taskId="a1" active />
    </div>
  )),
  projection: shown((close) => <ProjectionModal workspaceId="w" client={projections} planId="search-v2" title="Search v2" onClose={close} onCreated={() => undefined} />),
  'spec-changed': shown((close) => <SpecChangedModal workspaceId="w" client={projections} planId="search-v2" title="Search v2" onClose={close} onApplied={() => undefined} />),
  'task-drawer': own('Open the dialog', <OpenTask />),
  'review-info': own('Open the dialog', <OpenReview />),
  'mark-done': shown((close) => <MarkDoneDialog workspaceId="w" taskId="team-review" title="Review with team" onIssue onClose={close} onDone={close} />),
  // The real page shows New spec over the whole page, not inside a card.
  // New spec with nothing picked: categories and epics to choose from.
  'new-spec': shown((close) => createPortal(<div {...{ [APP_ATTR]: '' }}><NewPlanDrawer workspaceId="w" taken={[]} categories={['Platform', 'Search']} epics={[{ id: 'sdk-target', title: 'SDK target architecture' }]} onClose={close} /></div>, document.body)),
  'new-spec-template': shown((close) => createPortal(<div {...{ [APP_ATTR]: '' }}><NewPlanDrawer workspaceId="w" taken={[]} categories={[]} epics={[{ id: 'sdk-target', title: 'SDK target architecture' }]} start="template" onClose={close} /></div>, document.body)),
}

// One In flight row, for the title link test.
const flightRow = {
  slot: 's1',
  role: 'worker',
  focus: null,
  taskId: 'a1',
  title: 'Task a1',
  epic: 'e1',
  attempt: 1,
  model: 'alpha-1',
  startedAt: null,
  lastAt: null,
  status: 'busy',
  session: { slot: 's1', role: 'worker', attempt: 1, link: null, crew: null },
}
// Needs you's filter row in a list column (?modal=filter-row): two fields on
// the row, five behind the filter icon, the count and Refresh at the right.
const FilterRowDemo = () => {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const opts = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]
  return (
    <div style={{ width: 'min(100%, 380px)' }} data-filter-demo>
      <FilterPanel
        folded
        id="demo-filters"
        label="Filter conflicts"
        active={Boolean(q || kind)}
        onClear={() => (setQ(''), setKind(''))}
        fields={[
          { kind: 'search', key: 'q', label: 'Search', value: q, placeholder: 'Task, ID or detail', onChange: setQ, primary: true },
          { kind: 'select', key: 'kind', label: 'Kind', value: kind, options: opts, onChange: setKind, primary: true },
          { kind: 'select', key: 'epic', label: 'Epic', value: '', options: opts, onChange: () => undefined },
          { kind: 'select', key: 'repository', label: 'Repository', value: '', options: opts, onChange: () => undefined },
          { kind: 'select', key: 'age', label: 'Age', value: '', options: opts, onChange: () => undefined },
          { kind: 'select', key: 'changed-by', label: 'Changed by', value: '', options: opts, onChange: () => undefined },
        ]}
      >
        <span role="status" className="text-xs text-muted">4 of 4</span>
        <IconBtn icon={RefreshCw} label="Refresh" tooltip="Refresh" onClick={() => undefined} />
      </FilterPanel>
    </div>
  )
}
SCENARIOS['filter-row'] = { opener: '', render: () => <FilterRowDemo /> }
SCENARIOS['in-flight'] = { opener: '', render: () => <ul><InFlightRow row={flightRow as never} now={Date.now()} onInfo={() => undefined} /></ul> }
// Two rows with different roles, ids and actions: their columns must line up.
const reviewRow = { ...flightRow, slot: 's2', role: 'review:style', taskId: 'b22', title: 'A much longer task title for the second row', session: { ...flightRow.session, slot: 's2', role: 'review:style', link: '/chat?sid=s2' } }
SCENARIOS['in-flight-pair'] = { opener: '', render: () => <ul style={{ maxWidth: 900 }}><InFlightRow row={flightRow as never} now={Date.now()} onInfo={() => undefined} /><InFlightRow row={reviewRow as never} now={Date.now()} onInfo={() => undefined} onPickAgain={undefined} /></ul> }

// The whole page's top row (?app=1): workspaces and the line, nothing else
// answered, so each tab stays on its loading line. ?stopped=1 opens a stop.
if (query.get('app')) {
  answer('workspaces.list', () => ({ defaultWorkspace: 'w', items: [{ id: 'w', name: 'Workspace', served: true }] }))
  answer('flow.view', () => ({ line: query.get('stopped') ? [{ id: 'l1', manual: true, reason: 'bad base', scope: 'all', closedAt: null, branch: 'main', check: null }] : [] }))
}

// The Files fold's reads: a worktree with each kind of change.
const change = (path: string, status: string, additions: number | null, deletions: number | null, extra = {}) => ({ path, from: null, status, additions, deletions, binary: false, ...extra })
const changed = [
  change('README.md', 'modified', 3, 1),
  change('src/app/task-files.mjs', 'added', 256, 0),
  change('src/app/operations.mjs', 'modified', 3, 0),
  change('src/app/old-name.mjs', 'deleted', 0, 40),
  change('src/app/renamed.mjs', 'renamed', 2, 2, { from: 'src/app/before.mjs' }),
  change('assets/logo.png', 'modified', null, null, { binary: true }),
  change('notes.md', 'added', null, null, { untracked: true }),
]
answer('task.files', (body) => ({
  taskId: 'a1',
  mode: 'worktree',
  branch: 'avoozl/a1',
  remote: false,
  github: 'https://github.com/octo/app/tree/avoozl/a1',
  worktree: '/srv/worktrees/a1',
  base: 'abc123',
  head: 'def456',
  files: changed,
  totals: { files: changed.length, additions: 264, deletions: 43 },
  truncated: false,
  all: (body.input as { all?: boolean })?.all ? { paths: ['README.md', 'package.json', 'src/app/store.mjs', 'src/app/operations.mjs', 'src/app/task-files.mjs', 'src/app/renamed.mjs'], truncated: false } : null,
}))
answer('task.diff', (body) => ({
  path: (body.input as { path: string }).path,
  status: 'modified',
  from: null,
  additions: 3,
  deletions: 1,
  binary: false,
  tooLarge: false,
  diff: [
    'diff --git a/README.md b/README.md',
    'index 1a2b3c4..5d6e7f8 100644',
    '--- a/README.md',
    '+++ b/README.md',
    '@@ -1,6 +1,8 @@',
    ' # Avoozl',
    ' ',
    '-Plans and tasks in one place.',
    '+Plans, tasks, and agents in one local workspace.',
    '+',
    '+Review what a worker changed from the task drawer.',
    ' ',
    ' ## Install',
    ' ',
    ' Run npm install.',
    '',
  ].join('\n'),
}))

function Scenario({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const scenario = SCENARIOS[name]
  if (!scenario) return <p>Unknown modal {name}</p>
  const close = () => {
    state.closed += 1
    setOpen(false)
  }
  return <>{scenario.render(open, setOpen, close)}</>
}

// ?page=app: the whole Avoozl page on one workspace with intake on, for
// tests that move between tabs.
// &long=1 names the workspace long enough to need cutting short, and adds a
// second one to switch to.
answer('workspaces.list', () => ({
  defaultWorkspace: 'w',
  items: [
    { id: 'w', name: query.get('long') === '1' ? 'Recipe box planning and the meal planner rewrite' : 'Harness', root: '/w', enabled: true, state: 'ready', served: true },
    ...(query.get('long') === '1' ? [{ id: 'w2', name: 'Avoozl', root: '/w2', enabled: true, state: 'ready', served: false }] : []),
  ],
}))
// The install's name: quiet with one instance, shown in more places with &shared=1.
let instanceName = 'Mira'
answer('instance.view', () => ({ id: 'inst-0123456789ab', name: instanceName, others: query.get('shared') === '1' ? ['inst-aaaaaaaaaaaa'] : [], shared: query.get('shared') === '1' }))
answer('instance.rename', (body) => ({ id: 'inst-0123456789ab', name: (instanceName = String((body.input as { name?: string }).name)), others: [], shared: false }))
answer('untriaged.view', () => ({
  enabled: true,
  mode: null,
  total: 0,
  repositories: [],
  items: [],
  withRadar: [],
}))

// &graph=chains: the Graph on three specs with real chains (graph-chains.ts).
if (query.get('graph') === 'chains') answer('graph.view', () => chainsGraph)
// &graph=drafts: the same, plus one draft spec's tasks (graph-chains.ts).
if (query.get('graph') === 'drafts') answer('graph.view', () => draftsGraph)

function DeepLinkPage() {
  return (
    // As tall as the screen with no frame around it, so the nav reaches the window's bottom and the page's content pane scrolls on its own, as in the host.
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 0, height: '100vh', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text)' }}>
      <AvoozlApp />
    </div>
  )
}

// &triage=1: two untriaged items and two held by an Issue Radar crew, so the
// Needs you nav shows a count on each page (the Triage and Issue Radar shots).
if (query.get('page') === 'app' && query.get('triage') === '1') {
  const link = { url: '/issue-radar', exact: false, tooltip: 'Opens Issue Radar.' }
  const row = (number: number, title: string) => ({
    kind: 'issue', number, title, url: `https://github.com/acme/recipe-box/issues/${number}`, repository: 'acme/recipe-box', author: 'mira', createdAt: '2026-11-15T09:00:00Z', labels: ['bug'], comments: 1,
    source: 'github', id: `acme/recipe-box#${number}`, links: { github: `https://github.com/acme/recipe-box/issues/${number}`, issueRadar: link, review: null }, start: { plan: true, deliver: false },
  })
  const held = (number: number, title: string) => ({ ...row(number, title), claimed: number % 2 === 0, needsHuman: false, needsHumanLabel: 'crew: needs human', handoff: null })
  answer('untriaged.view', () => ({
    enabled: true,
    mode: 'plans-repo',
    total: 2,
    repositories: [{ repository: 'acme/recipe-box', checkedAt: '2026-11-16T09:00:00Z', error: null, searched: 4, read: 4, truncated: false, count: 4, query: null, filter: null, defaultFilter: '', notify: false }],
    items: [row(44, 'Recipe photos load slowly on the list'), row(45, 'Add a shopping list export')],
    withRadar: [held(51, 'Search ignores accents'), held(52, 'Print view cuts off steps')],
  }))
}

// ?page=home: the Dashboard alone with nothing in flight (?page=demo uses
// the same answers for the real workspace, before the sample opens). &ran=1 gives the
// workspace one finished task (it has run before); without it, none has.
if (query.get('page') === 'home' || query.get('page') === 'demo') {
  const ran = query.get('ran') === '1'
  const item = { id: 'a1', title: 'Task a1', complete: true, deliveries: [], sessions: [], evidence: [], integration: { commit: 'c', branch: 'main', at: '2026-11-13T10:00:00Z' }, pullRequests: [], issue: null }
  answer('delivery.view', () => ({ revision: 1, items: ran ? [item] : [] }))
  answer('conflicts.view', () => ({ revision: 1, items: [] }))
  answer('plan.list', () => ({ items: [] }))
  // Home reads these too; an unanswered call never settles.
  answer('radar.crews', () => ({ readAt: null, stale: 0, errors: [], unseen: [], rows: [] }))
  answer('radar.releasequeue', () => ({ repositories: [] }))
  answer('landing.view', () => ({ queue: [], landed: [], landedThisWeek: 0 }))
}
// ?page=app: Settings reads the GitHub policy. &worker=1 leaves one
// repository on the retired Avoozl worker, which shows the Settings banner.
if (query.get('page') === 'app') {
  const worker = query.get('worker') === '1'
  // &needs=N: N open Needs you items, so the nav shows its count. Home's
  // other reads answer empty, so Home fills in.
  const needs = Number(query.get('needs') ?? 0)
  const item = (n: number) => ({ key: `k${n}`, kind: 'decision', taskId: `t${n}`, title: `Item ${n}`, detail: 'Waits on you.', plan: 'meal-planner', epic: null, repository: 'example/recipe-box', since: '2026-11-14T10:00:00Z' })
  // &reviewgroup=1: one review group (two tasks changed in a spec) in Needs you.
  const reviewGroup = { key: 'g1', kind: 'review', reason: 'review', taskId: null, title: 'Meal planner: sections changed', detail: 'Two tasks changed.', plan: 'meal-planner', epic: null, repository: null, since: '2026-11-14T10:00:00Z', tasks: [{ id: 'team-review', title: 'Review with team', status: 'planned' }, { id: 'cutover', title: 'Cutover', status: 'planned' }] }
  answer('conflicts.view', () => ({ revision: 1, items: [...Array.from({ length: needs }, (_, n) => item(n + 1)), ...(query.get('reviewgroup') === '1' ? [reviewGroup] : [])] }))
  if (!replyFor('delivery.view')) answer('delivery.view', () => ({ revision: 1, items: [] }))
  if (!replyFor('plan.list')) answer('plan.list', () => ({ items: [] }))
  // &slowradar=1: Radar's crews read never answers, as a slow GitHub or
  // Kiro Crew would; Home must not wait on it.
  if (query.get('slowradar') === '1') answer('radar.crews', () => new Promise(() => undefined))
  else if (!replyFor('radar.crews')) answer('radar.crews', () => ({ readAt: null, stale: 0, errors: [], unseen: [], rows: [] }))
  if (!replyFor('radar.releasequeue')) answer('radar.releasequeue', () => ({ repositories: [] }))
  if (!replyFor('remote.view')) answer('remote.view', () => ({ workers: [] }))
  if (!replyFor('landing.view')) answer('landing.view', () => ({ queue: [], landed: [], landedThisWeek: 0 }))
  // &home=empty: Home's CI read answers with no runs (only Home reads it).
  if (query.get('home') === 'empty') answer('flow.view', () => ({ line: [], stages: [], tasks: [], retros: [], flaky: [], ciOnly: [], ci: { repositories: [] } }))
  // &roles=plans|single|local: Repository setup with a role on each row
  // (R105), the planning repository without a checkout in &roles=plans.
  const roles = query.get('roles')
  const rolesGithub = roles === 'single'
    ? { mode: 'single-repo', defaultAuthority: 'github', repositories: { 'acme/recipe-box': { baseBranch: 'main', role: 'both' }, 'acme/recipe-api': { baseBranch: 'main', role: 'both' } } }
    : roles === 'local'
      ? { repositories: { 'acme/recipe-box': { baseBranch: 'main', role: 'local' }, 'acme/recipe-api': { baseBranch: 'main', role: 'local' } } }
      : { mode: 'plans-repo', planningRepository: 'acme/plans', defaultAuthority: 'github', epicIssueType: 'Epic', project: { owner: 'acme', number: 7 }, repositories: { 'acme/recipe-box': { baseBranch: 'main', role: 'code' }, 'acme/recipe-api': { baseBranch: 'main', role: 'code' } } }
  if (roles)
    answer('repositories.list', () => ({ items: [
      { id: 'recipe-box', name: 'recipe-box', localCheckout: '/src/recipe-box', github: 'acme/recipe-box', baseBranch: 'main' },
      { id: 'recipe-api', name: 'recipe-api', localCheckout: '/src/recipe-api', github: 'acme/recipe-api', baseBranch: 'main' },
      { id: 'notes', name: 'notes', localCheckout: '/src/notes', github: null, baseBranch: 'main' },
    ] }))
  answer('github.settings.get', () => ({
    filename: '.avoozl.json',
    exists: true,
    hash: 'h',
    github: roles ? rolesGithub : { mode: 'plans-repo', repositories: { 'acme/recipe-box': worker ? { coder: 'worker' } : { coder: 'issue-radar' } } },
    effective: null,
    error: null,
    crews: [],
    rate: {
      cacheSeconds: 60,
      resources: {},
      limitedUntil: null,
      limitedResource: null,
      calls: 0,
      notModified: 0,
      notModifiedShare: null,
      hourCalls: 153,
      bySource: { tick: { calls: 88, notModified: 40, cached: 0 }, crew: { calls: 41, notModified: 0, cached: 0 }, view: { calls: 17, notModified: 21, cached: 132 }, review: { calls: 5, notModified: 0, cached: 3 }, setup: { calls: 2, notModified: 0, cached: 0 } },
      writes: { perMinute: 60, perHour: 400, run: { planId: 'nupp', done: 312, total: 1740, resumeAt: new Date(Date.now() + 38 * 60000).toISOString() } },
    },
    choices: { modes: ['local', 'plans-repo', 'single-repo'], authorities: [], coders: ['issue-radar', 'remote'], permissions: [], actions: [], fields: [], statusValues: [], managedLabels: [], crewLabels: [] },
  }))
  // &ghfull=1: the same settings with two Issue Radar crews, their Radar
  // values and the last hour's GitHub calls by source, so Settings › GitHub
  // and Settings › Issue Radar show every section.
  if (query.get('ghfull') === '1') {
    const base = replyFor('github.settings.get')!({}) as Record<string, unknown>
    answer('github.settings.get', () => ({
      ...base,
      choices: { ...(base.choices as object), crewLabels: ['claim', 'needsHuman'] },
      crews: [
        { repository: 'acme/recipe-box', label: 'ready', link: '/issue-radar' },
        { repository: 'acme/recipe-api', label: null, link: '/issue-radar' },
      ],
      rate: {
        ...(base.rate as object),
        resources: { core: { limit: 5000, remaining: 1078, resetAt: new Date(Date.now() + 22 * 60000).toISOString() } },
        calls: 214,
        notModified: 61,
        notModifiedShare: 61 / 214,
        hourCalls: 153,
        bySource: { tick: { calls: 88, notModified: 40, cached: 0 }, crew: { calls: 41, notModified: 0, cached: 0 }, view: { calls: 17, notModified: 21, cached: 132 }, review: { calls: 5, notModified: 0, cached: 3 }, setup: { calls: 2, notModified: 0, cached: 0 } },
      },
    }))
    answer('radar.values', (body) => {
      const repository = (body as { input: { repository: string } }).input.repository
      const item = (id: string, label: string, value: string) => ({ id, label, value, controls: `What ${label} controls.`, status: 'cannot-verify', note: 'Tick it yourself.' })
      return { repository, grant: false, link: '/issue-radar', items: [item('repository', 'Repository to connect', repository), item('agent', 'Agent', 'avoozl-crew'), item('scope', 'Label scope', 'ready')] }
    })
  }
}
// ?page=app&home=1: a busy Home (task home-radar-layout shots): tasks in
// every state, four Needs you items, two chats (one quiet), a landing
// queue with a held portion, landings this week and CI facts. Times are
// relative to now so the quiet chat and this week's landings stay true.
if (query.get('page') === 'app' && query.get('home') === '1') {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()
  const t = (id: string, title: string, epic: string, extra = {}) => ({ ...task(id, epic), title, planId: epic === 'e1' ? 'meal-planner' : 'search-v2', repository: 'recipe-box', phase: null, ...extra })
  const graphTasks = [
    t('m1', 'Add the shopping list export', 'e1', { state: 'ready', ready: true }),
    t('m2', 'Scale servings in the recipe card', 'e1', { state: 'ready', ready: true }),
    t('m4', 'Print one recipe', 'e1', { state: 'ready', ready: true }),
    t('m3', 'Sync pantry items between devices', 'e1', { state: 'running', status: 'running' }),
    t('s1', 'Index recipes by ingredient', 'e2', { state: 'running', status: 'review' }),
    t('s2', 'Rank results by cooking time', 'e2', { state: 'needs-you', decision: 'Pick a ranking rule' }),
    t('s3', 'Typo-tolerant search', 'e2', { state: 'waiting' }),
    t('s5', 'Search suggestions', 'e2', { state: 'waiting' }),
    t('s6', 'Recipe tags', 'e2', { state: 'done', status: 'done', complete: true }),
    t('m5', 'Meal plan calendar', 'e1', { state: 'done', status: 'done', complete: true }),
  ]
  answer('graph.view', () => ({
    revision: 1,
    epics: [
      { id: 'e1', title: 'Meal planner', count: 5 },
      { id: 'e2', title: 'Search v2', count: 5 },
    ],
    statuses: [
      { id: 'planned', label: 'Planned', complete: false },
      { id: 'done', label: 'Done', complete: true },
    ],
    repositories: ['recipe-box'],
    total: graphTasks.length,
    tasks: graphTasks,
    edges: [],
  }))
  answer('plan.list', () => ({ total: 2, items: [{ id: 'meal-planner', title: 'Meal planner', state: 'approved', archivedAt: null }, { id: 'search-v2', title: 'Search v2', state: 'approved', archivedAt: null }] }))
  const session = (slot: string, role: string, status: string, minutes: number) => ({ slot, role, status, attempt: 1, link: `/sessions/${slot}`, boundAt: ago(minutes + 20), statusAt: ago(minutes), agent: 'kirocrew-worker', model: null })
  const item = (id: string, title: string, extra = {}) => ({
    id, title, status: 'planned', complete: false, repository: null, authority: 'local', sessions: [], runs: [], evidence: [], integration: null, pullRequests: [], deliveries: [], worktrees: [], issue: null, ...extra,
  })
  answer('delivery.view', () => ({
    revision: 1,
    items: [
      item('m3', 'Sync pantry items between devices', { status: 'running', sessions: [session('chat-m3', 'worker', 'coding', 4)], deliveries: [{ state: 'running', updatedAt: ago(4) }] }),
      item('s1', 'Index recipes by ingredient', { status: 'review', sessions: [session('chat-s1', 'reviewer', 'reading', 95)], deliveries: [{ state: 'done', updatedAt: ago(95) }] }),
      item('s6', 'Recipe tags', { status: 'done', complete: true, integration: { commit: 'c1', branch: 'main', at: ago(60 * 26) }, pullRequests: [{ number: 41, url: 'https://github.com/acme/recipe-box/pull/41', merged: true }] }),
      item('m5', 'Meal plan calendar', { status: 'done', complete: true, integration: { commit: 'c2', branch: 'main', at: ago(60 * 24 * 9) }, pullRequests: [{ number: 33, url: 'https://github.com/acme/recipe-box/pull/33', merged: true }] }),
    ],
  }))
  const need = (key: string, kind: string, taskId: string | null, title: string, detail: string) => ({ key, kind, taskId, title, detail, plan: 'search-v2', epic: null, repository: 'acme/recipe-box', since: ago(50) })
  answer('conflicts.view', () => ({
    revision: 1,
    items: [
      need('n1', 'decision', 's2', 'Rank results by cooking time', 'Pick a ranking rule: total time, or active time only. Dependents wait on this answer.'),
      need('n2', 'needs-human', 'm2', 'Scale servings in the recipe card', 'The crew asks whether servings round up or down when scaling.'),
      need('n3', 'github-conflict', 'm1', 'Add the shopping list export', 'The title changed on GitHub and in Avoozl. Pick the one to keep.'),
      need('n4', 'branch-landing', null, 'Search v2 integration branch', 'Checks passed on the branch head. Approve it to land on main.'),
    ],
  }))
  answer('landing.view', () => ({
    queue: [
      { key: 'q1', base: 'main', repository: 'acme/recipe-box', tasks: [{ id: 's1', title: 'Index recipes by ingredient' }], pr: 47, url: 'https://github.com/acme/recipe-box/pull/47', position: 0, queuedAt: ago(12), held: 'Next to land; checks run on the next tick.' },
      { key: 'q2', base: 'main', repository: 'acme/recipe-box', tasks: [{ id: 'm3', title: 'Sync pantry items between devices' }], pr: 48, url: 'https://github.com/acme/recipe-box/pull/48', position: 1, queuedAt: ago(6), held: 'Behind 1 portion.' },
    ],
    landed: [
      { key: 'l1', base: 'main', repository: 'acme/recipe-box', tasks: [{ id: 's6', title: 'Recipe tags' }], pr: 41, url: 'https://github.com/acme/recipe-box/pull/41', at: ago(60 * 26) },
      { key: 'l2', base: 'main', repository: 'acme/recipe-box', tasks: [{ id: 's7', title: 'Ingredient synonyms' }, { id: 's8', title: 'Synonym admin' }], pr: 39, url: 'https://github.com/acme/recipe-box/pull/39', at: ago(60 * 50) },
      { key: 'l3', base: 'main', repository: 'acme/recipe-box', tasks: [{ id: 'm6', title: 'Pantry barcode scan' }], pr: 36, url: 'https://github.com/acme/recipe-box/pull/36', at: ago(60 * 24 * 4) },
    ],
    landedThisWeek: 3,
  }))
  const metrics = { tasks: 4, leadTimeMs: 52 * 60000, flowEfficiency: 0.62, firstPassRate: 0.75, changeFailureRate: 0, integrationsPerDay: 1.2, timeToFixMs: null }
  const byClass = { code: { task: { minutes: 64, pullRequests: 6 }, other: { minutes: 12, pullRequests: 2 } } }
  answer('flow.view', () => ({
    window: { size: 10, since: null }, metrics, previous: metrics, bottleneck: null, tasks: [], stops: [], line: [],
    flaky: [{ id: 'f1', check: 'test (windows)', commit: 'c1', at: ago(300) }], ciOnly: [], retros: [], batches: [], stages: [],
    repositories: ['acme/recipe-box', 'acme/docs'], epics: [], series: { day: [], week: [] },
    usage: { available: false, total: { input: 0, output: 0, credits: 0, turns: 0 }, byTask: [], byPlan: [], byStage: [], byModel: [], byDay: [], byWeek: [] },
    ci: {
      repositories: [
        { repository: 'acme/recipe-box', windowDays: 14, byClass, waitShare: 0.18, waitLimit: 0.25, closedPullRequests: 14, repeats: [{ workflow: 'ci', commits: 2, extraRuns: 2, extraMinutes: 9 }] },
        { repository: 'acme/docs', windowDays: 14, byClass, waitShare: 0.34, waitLimit: 0.25, closedPullRequests: 5, repeats: [] },
      ],
    },
  }))
}
// &inline=1: a stateful backend for the Settings pages that edit in place.
if (query.get('page') === 'app' && query.get('inline') === '1') installInlineFixture()
// &escalations=after: one Issue Radar escalation in Intake (listed first,
// with Plan this and Deliver this) and one in Needs you with the same two
// buttons. &escalations=before: the same issues as main's backend sends
// them, with no escalation fields (task 56.14's before/after shots).
if (query.get('page') === 'app' && query.get('escalations')) {
  const after = query.get('escalations') === 'after'
  const link = { url: '/issue-radar', exact: false, tooltip: 'Opens Issue Radar.' }
  const row = (number: number, title: string, createdAt: string, labels: string[]) => ({
    kind: 'issue', number, title, url: `https://github.com/acme/recipe-box/issues/${number}`, repository: 'acme/recipe-box', author: 'mira', createdAt, labels, comments: 2,
    source: 'github', id: `acme/recipe-box#${number}`, links: { github: `https://github.com/acme/recipe-box/issues/${number}`, issueRadar: link, review: null },
  })
  const escalation = { ...row(41, 'Add a shopping list export', '2026-11-12T09:00:00Z', ['crew: needs human']), start: { plan: true, deliver: after } }
  const items = [
    ...(after ? [{ ...escalation, escalation: { label: 'crew: needs human', scope: 'new-feature', claimed: false, draft: null } }] : []),
    { ...row(44, 'Recipe photos load slowly on the list', '2026-11-15T09:00:00Z', ['bug']), start: { plan: true, deliver: false } },
    ...(after ? [] : [escalation]),
  ]
  answer('untriaged.view', () => ({
    enabled: true,
    mode: 'plans-repo',
    total: items.length,
    repositories: [{ repository: 'acme/recipe-box', checkedAt: '2026-11-16T09:00:00Z', error: null, searched: 2, read: 2, truncated: false, count: 2, query: null, filter: null, defaultFilter: '', notify: false }],
    items,
    withRadar: [],
  }))
  const crewRow = {
    kind: 'needs-human', reason: 'crew', id: 'radar:acme/recipe-box#38', taskId: null, authority: 'github', since: '2026-11-15T12:00:00Z',
    issue: { number: 38, url: 'https://github.com/acme/recipe-box/issues/38', repository: 'acme/recipe-box' },
    link: 'https://github.com/acme/recipe-box/issues/38',
    title: 'acme/recipe-box #38 needs a person: Should servings round up or down?',
    detail: after
      ? 'An Issue Radar crew added "crew: needs human". Plan this or Deliver this takes it into Avoozl and adds crew:avoozl, so crews skip it; the needs-human label stays. Or answer it on GitHub; the crew picks the issue up again when the label comes off.'
      : 'An Issue Radar crew added "crew: needs human". Answer it on GitHub; the crew picks the issue up again when the label comes off.',
    ...(after
      ? { item: { source: 'github', id: 'acme/recipe-box#38' }, escalation: { label: 'crew: needs human', scope: 'needs-decision', claimed: false, draft: null }, start: { plan: true, deliver: true } }
      : {}),
  }
  answer('conflicts.view', () => ({ revision: 1, items: [crewRow] }))
}
// &delivery=1: tasks in every Delivery lane across two epics and specs.
if (query.get('page') === 'app' && query.get('delivery') === '1') {
  const at = '2026-11-16T09:00:00Z'
  const t = (id: string, title: string, epic: string, planId: string, repository: string, extra = {}) => ({ ...task(id, epic), title, planId, spec: planId, repository, phase: null, ...extra })
  const graphTasks = [
    t('m1', 'Add the shopping list export', 'e1', 'meal-planner', 'recipe-box', { state: 'ready', ready: true }),
    t('m2', 'Scale servings in the recipe card', 'e1', 'meal-planner', 'recipe-box', { state: 'ready', ready: true }),
    t('m3', 'Sync pantry items between devices', 'e1', 'meal-planner', 'recipe-box', { state: 'running', status: 'running' }),
    t('s1', 'Index recipes by ingredient', 'e2', 'search-v2', 'search', { state: 'running', status: 'review' }),
    t('s2', 'Rank results by cooking time', 'e2', 'search-v2', 'search', { state: 'needs-you', decision: 'Pick a ranking rule' }),
    t('s3', 'Typo-tolerant search', 'e2', 'search-v2', 'search', { state: 'waiting' }),
    t('s4', 'Search history', 'e2', 'search-v2', 'search', { state: 'deferred', status: 'deferred' }),
  ]
  answer('graph.view', () => ({
    revision: 1,
    epics: [
      { id: 'e1', title: 'Meal planner', count: 3 },
      { id: 'e2', title: 'Search v2', count: 4 },
    ],
    plans: [
      { id: 'meal-planner', title: 'Meal planner' },
      { id: 'search-v2', title: 'Search v2' },
    ],
    statuses: [
      { id: 'planned', label: 'Planned', complete: false },
      { id: 'deferred', label: 'Deferred', complete: false },
      { id: 'done', label: 'Done', complete: true },
    ],
    repositories: ['recipe-box', 'search'],
    total: graphTasks.length,
    tasks: graphTasks,
    edges: [{ from: 's1', to: 's3', kind: 'requires', blocking: true, satisfied: false }],
  }))
  const session = (slot: string, role: string, status: string) => ({ slot, role, status, attempt: 1, link: `/sessions/${slot}`, boundAt: at, statusAt: at, agent: 'kirocrew-worker', model: null })
  const item = (id: string, title: string, extra = {}) => ({
    id, title, status: 'planned', complete: false, repository: null, authority: 'local', sessions: [], runs: [], evidence: [], integration: null, pullRequests: [], deliveries: [], worktrees: [], issue: null, ...extra,
  })
  answer('delivery.view', () => ({
    revision: 1,
    items: [
      item('m3', 'Sync pantry items between devices', { status: 'running', sessions: [session('chat-m3', 'worker', 'coding')], deliveries: [{ state: 'running', updatedAt: at }] }),
      item('s1', 'Index recipes by ingredient', { status: 'review', sessions: [session('chat-s1', 'reviewer', 'reading')], deliveries: [{ state: 'done', updatedAt: at }] }),
      item('s2', 'Rank results by cooking time', { deliveries: [{ state: 'decision', updatedAt: at }] }),
    ],
    contentReports: [],
  }))
  // The line, for the Delivery heading's Stop the line: a stop opens one,
  // Resume closes it. window.__lineCalls records both. &stopped=1 starts stopped.
  const lineWin = window as unknown as { __lineCalls: unknown[] }
  lineWin.__lineCalls = []
  const open = (reason: string) => ({ id: 'l1', manual: true, by: { kind: 'person', name: 'you' }, reason, scope: 'all', closedAt: null, branch: 'main', check: null, openedAt: at })
  let stops = query.get('stopped') ? [open('bad base')] : []
  answer('flow.view', () => ({ line: stops, stages: [], tasks: [], retros: [] }))
  answer('flow.stop', (body) => {
    const input = body.input as { reason: string }
    lineWin.__lineCalls.push({ stop: input })
    stops = [open(input.reason)]
    return { stop: stops[0] }
  })
  answer('flow.resume', (body) => {
    lineWin.__lineCalls.push({ resume: (body.input as { stopId?: string }).stopId })
    stops = []
    return { stop: { id: 'l1', closedAt: new Date().toISOString() } }
  })
}
// &process=1: Home's In flight with a `process` worker (Claude Code under
// the supervisor, resumed once, cost known) beside a Kiro Crew reviewer
// chat (task 50.1 shots). Paths are made up.
if (query.get('page') === 'app' && query.get('process') === '1') {
  const at = new Date(Date.now() - 12 * 60000).toISOString()
  const t = (id: string, title: string, extra = {}) => ({ ...task(id, 'e1'), title, planId: 'meal-planner', spec: 'meal-planner', repository: 'recipe-box', phase: null, ...extra })
  answer('graph.view', () => ({
    revision: 1,
    epics: [{ id: 'e1', title: 'Meal planner', count: 2 }],
    plans: [{ id: 'meal-planner', title: 'Meal planner' }],
    statuses: [{ id: 'planned', label: 'Planned', complete: false }, { id: 'done', label: 'Done', complete: true }],
    repositories: ['recipe-box'],
    total: 2,
    tasks: [t('m3', 'Sync pantry items between devices', { state: 'running', status: 'running' }), t('s1', 'Index recipes by ingredient', { state: 'running', status: 'review' })],
    edges: [],
  }))
  const uuid = '6f1c2b9e-4d7a-4c1e-9b0a-2f5e8d3c7a41'
  const log = [
    'Reading src/pantry/sync.ts',
    'Editing src/pantry/sync.ts: merge by item id, newest edit wins',
    'Running npm test -- pantry',
    '  ✓ merges two devices (12 ms)',
    '  ✓ keeps a deleted item deleted (4 ms)',
    'Writing .avoozl/result.json',
  ].join('\n')
  const item = (id: string, title: string, sessions: unknown[]) => ({
    id, title, status: 'running', complete: false, repository: 'recipe-box', authority: 'local', sessions, runs: [], evidence: [], integration: null, pullRequests: [], deliveries: [{ state: 'running', updatedAt: at }], worktrees: [], issue: null,
  })
  answer('delivery.view', () => ({
    revision: 1,
    items: [
      item('m3', 'Sync pantry items between devices', [
        {
          slot: `process-${uuid}`, role: 'worker', attempt: 1, title: null, status: 'working', statusAt: at, boundAt: at, model: 'claude-sonnet', crew: 'local', executor: 'process', link: null,
          process: { harness: 'claude-code', state: 'running', exitCode: null, run: 2, logTail: log, cost: 0.83, attach: `cd /work/recipe-box-m3 && claude --resume ${uuid}` },
        },
      ]),
      item('s1', 'Index recipes by ingredient', [
        { slot: 'chat-s1', role: 'reviewer', attempt: 1, title: null, status: 'reading', statusAt: at, boundAt: at, agent: 'kirocrew-worker', model: null, crew: 'local', executor: 'kirocrew', link: '/chat?sid=chat-s1' },
      ]),
    ],
    contentReports: [],
  }))
  // Send message (task 50.2): kept on window.__sent for the test.
  answer('session.send', (body) => {
    const input = body.input as { slot: string; text: string }
    ;(window as unknown as { __sent: unknown[] }).__sent = [...((window as unknown as { __sent?: unknown[] }).__sent ?? []), input]
    return { id: 'send:1', state: 'queued', slot: input.slot, taskId: 'm3' }
  })
}
// &links=1: Home's In flight with PR and branch chips (task 44.4): checks
// pass, running, fail and stale, a long branch name, and a row with a branch
// but no pull request. Repositories and numbers are made up.
if (query.get('page') === 'app' && query.get('links') === '1') {
  const at = new Date(Date.now() - 9 * 60000).toISOString()
  const t = (id: string, title: string) => ({ ...task(id, 'e1'), title, planId: 'meal-planner', spec: 'meal-planner', repository: 'recipe-box', phase: null, state: 'running', status: 'running' })
  const rows: [string, string, string, string, number | null, string | null][] = [
    ['m3', 'Sync pantry items between devices', 'worker', 'avoozl/meal-planner/m3-sync-pantry-items-between-devices', 412, 'pass'],
    ['s1', 'Index recipes by ingredient', 'reviewer', 'avoozl/s1', 415, 'pending'],
    ['s3', 'Show prep time on each card', 'checks', 'avoozl/s3-prep-time', 418, 'fail'],
    ['s4', 'Keep the shopping list in sync', 'worker', 'avoozl/s4-list-sync', 420, 'stale'],
    ['s5', 'Add a print view for one recipe', 'worker', 'avoozl/s5-print-view', null, null],
  ]
  answer('graph.view', () => ({
    revision: 1,
    epics: [{ id: 'e1', title: 'Meal planner', count: rows.length }],
    plans: [{ id: 'meal-planner', title: 'Meal planner' }],
    statuses: [{ id: 'planned', label: 'Planned', complete: false }, { id: 'done', label: 'Done', complete: true }],
    repositories: ['recipe-box'],
    total: rows.length,
    tasks: rows.map(([id, title]) => t(id, title)),
    edges: [],
  }))
  const repo = 'https://github.com/acme/recipe-box'
  answer('delivery.view', () => ({
    revision: 1,
    items: rows.map(([id, title, role, ref, pr, dot], index) => ({
      id, title, status: 'running', complete: false, repository: 'recipe-box', authority: 'local', runs: [], evidence: [], integration: null, pullRequests: [], deliveries: [{ state: 'running', updatedAt: at }], worktrees: [], issue: null,
      sessions: [{ slot: `chat-${id}`, role, attempt: 1, title: null, status: 'working', statusAt: new Date(Date.now() - (index + 1) * 60000).toISOString(), boundAt: at, agent: 'kirocrew-worker', model: 'claude-sonnet', crew: 'local', executor: 'kirocrew', link: `/chat?sid=chat-${id}` }],
      links: {
        branch: { kind: 'branch', repository: 'acme/recipe-box', ref, url: `${repo}/tree/${ref}` },
        pr: pr ? { kind: 'pull', repository: 'acme/recipe-box', number: pr, url: `${repo}/pull/${pr}`, state: 'open' } : null,
        checks: dot
          ? { state: dot === 'stale' ? 'pass' : dot, dot, head: (dot === 'stale' ? 'b' : 'a').repeat(40), ageMs: (index + 2) * 60000, current: dot !== 'stale', url: `${repo}/pull/${pr}/checks` }
          : null,
      },
    })),
    contentReports: [],
  }))
}
// &publiccrews=after: Intake with the Public crews card (task 39.3): one
// repository ready to sign off, one signed off, and one with no rule set
// (the banner) whose sign-off lapsed. &publiccrews=before: the same Intake
// as main's backend sends it, with no card.
if (query.get('page') === 'app' && query.get('publiccrews')) {
  const after = query.get('publiccrews') === 'after'
  const link = { url: '/issue-radar', exact: false, tooltip: 'Opens Issue Radar.' }
  const items = [44, 45].map((number) => ({
    kind: 'issue', number, title: number === 44 ? 'Recipe photos load slowly on the list' : 'Add a print view for one recipe', url: `https://github.com/acme/recipe-box/issues/${number}`, repository: 'acme/recipe-box', author: 'mira', createdAt: '2026-11-15T09:00:00Z', labels: ['bug'], comments: 1,
    source: 'github', id: `acme/recipe-box#${number}`, links: { github: `https://github.com/acme/recipe-box/issues/${number}`, issueRadar: link, review: null },
  }))
  const check = (key: string, label: string, ok: boolean, line: string) => ({ key, label, ok, line })
  const ok = [
    check('home', 'Crew home', true, 'No steering, memory or notes. Injected context only.'),
    check('hook', 'Content hook', true, 'avoozl-crew runs the hook (3f9a1c27d0b4).'),
    check('rules', 'Content rule sets', true, 'company-terms cover it.'),
    check('audit', 'Audit on the tick', true, 'The tick audits this repository.'),
  ]
  const publicCrews = [
    { repository: 'acme/recipe-box', visibility: 'public', home: '/srv/crew-homes/recipe-box', agent: 'avoozl-crew', signedOff: null, lapsed: false, banner: null, items: ok, ready: true },
    { repository: 'acme/docs', visibility: 'public', home: '/srv/crew-homes/docs', agent: 'avoozl-crew', signedOff: { by: 'mira', at: '2026-11-17T09:12:00.000Z' }, lapsed: false, banner: null, items: ok, ready: true },
    {
      repository: 'acme/web', visibility: 'unknown', home: '/srv/crew-homes/web', agent: 'avoozl-crew', signedOff: null, lapsed: true,
      banner: 'No content rule set covers this public repository, so sign-off stays closed. Add one in Settings › Content rules.',
      items: [ok[0], check('hook', 'Content hook', false, 'avoozl-crew has no preToolUse hook that runs `avoozl content hook` on shell calls.'), check('rules', 'Content rule sets', false, 'No rule set covers this repository.'), ok[3]],
      ready: false,
    },
  ]
  answer('untriaged.view', () => ({
    enabled: true,
    mode: 'plans-repo',
    total: items.length,
    repositories: [{ repository: 'acme/recipe-box', checkedAt: '2026-11-17T09:00:00Z', error: null, searched: 2, read: 2, truncated: false, count: 2, query: null, filter: null, defaultFilter: '', notify: false }],
    items,
    withRadar: [],
    ...(after ? { publicCrews } : {}),
  }))
}
// ?page=app&radar=1: the Dashboard has one live Issue Radar claim.
if (query.get('radar') === '1') {
  answer('delivery.view', () => ({ revision: 1, items: [] }))
  answer('conflicts.view', () => ({ revision: 1, items: [] }))
  answer('plan.list', () => ({ items: [] }))
  answer('remote.view', () => ({ workers: [] }))
  const noMetrics = { tasks: 0, leadTimeMs: null, flowEfficiency: null, firstPassRate: null, changeFailureRate: null, integrationsPerDay: null, timeToFixMs: null }
  const noUsage = { input: 0, output: 0, credits: 0, turns: 0 }
  answer('flow.view', () =>
    query.get('receipt')
      ? { window: { size: 20, since: null }, metrics: noMetrics, previous: noMetrics, bottleneck: null, tasks: [], stops: [], line: [], flaky: [], ciOnly: [], retros: [], batches: [], stages: [], repositories: ['acme/recipe-box'], epics: [], series: { day: [], week: [] }, usage: { available: false, total: noUsage, byTask: [], byPlan: [], byStage: [], byModel: [], byDay: [], byWeek: [] } }
      : { line: [], stages: [], tasks: [], retros: [] },
  )
  answer('radar.releasequeue', () => ({ repositories: [] }))
  answer('radar.crews', () => ({
    readAt: '2026-11-09T10:10:00Z',
    stale: 0,
    errors: [],
    unseen: ['paused', 'machine', 'chat'],
    rows: [{ repository: 'acme/recipe-box', number: 52, title: 'Index builder', url: 'https://github.com/acme/recipe-box/issues/52', crewId: 'c_022aea7f', crewName: 'Draco', phase: 'implementing', pr: 57, prUrl: 'https://github.com/acme/recipe-box/pull/57', updated: '2026-11-09T09:46:00Z', commentUrl: null, stale: false, noMarker: false }],
  }))
}
// ?page=app&flow=1: Flow and Settings ›
// Flow, for the owner-rule screenshots (flow-rules-shots.mjs).
if (query.get('page') === 'app' && query.get('flow') === '1') {
  const metrics = { tasks: 1, leadTimeMs: 52 * 60000, flowEfficiency: 0.62, firstPassRate: 1, changeFailureRate: 0, integrationsPerDay: null, timeToFixMs: null }
  const usage = { available: false, total: { input: 0, output: 0, credits: 0, turns: 0 }, byTask: [], byPlan: [], byStage: [], byModel: [], byDay: [], byWeek: [] }
  const stages = { queued: 4 * 60000, coding: 30 * 60000, tests: 8 * 60000, 'ci-wait': 10 * 60000 }
  const task = { taskId: 'search.3', title: 'Index builder', repository: 'acme/recipe-box', epic: null, startedAt: '2026-11-15T09:00:00Z', finishedAt: '2026-11-15T09:52:00Z', leadMs: 52 * 60000, activeMs: 38 * 60000, stages, coarse: false, sources: ['tool-calls'], batch: null, firstPass: true }
  answer('radar.flow', () => ({ readAt: null, count: 0, issues: [], skipped: [], median: null, medianLead: null, efficiency: null, bottleneck: null, errors: [], repositories: [] }))
  answer('flow.view', () => ({
    window: { size: 20, since: null },
    metrics,
    previous: metrics,
    bottleneck: null,
    tasks: [task],
    stops: [],
    line: [],
    flaky: [],
    ciOnly: [],
    retros: [],
    batches: [],
    stages: [],
    repositories: ['acme/recipe-box'],
    epics: [],
    plans: [],
    phases: [],
    series: { day: [], week: [] },
    usage,
  }))
  answer('flow.proposals', () => ({ proposals: [], dropped: [], prompts: [], notes: [], available: false }))
  answer('flow.settings.get', () => ({
    filename: '.avoozl.json',
    exists: true,
    hash: 'h',
    flow: {},
    repositories: {},
    instructions: '',
    retroPrompt: null,
    ciClassGlobs: {
      ci: ['.github/', '.gitlab-ci.yml', '.circleci/'],
      spec: ['.kiro/specs/'],
      tests: ['test/', 'tests/', '**/test/**', '**/*.test.*'],
      docs: ['docs/', '*.md', '**/*.md'],
      other: ['package-lock.json', '*.lock'],
    },
  }))
}
// ?page=app&retros=1: Flow with three tasks in two repositories and two
// specs, whose read follows the repository, spec and stage it is asked for,
// and Retros with two retros and the proposals they made (the Retros pill
// and Flow nav filters shots and test).
if (query.get('page') === 'app' && query.get('retros') === '1') {
  const noUsage = { available: false, total: { input: 0, output: 0, credits: 0, turns: 0 }, byTask: [], byPlan: [], byStage: [], byModel: [], byDay: [], byWeek: [] }
  const min = 60000
  const mk = (taskId: string, title: string, repository: string, plan: string, at: string, stages: Record<string, number>) => {
    const leadMs = Object.values(stages).reduce((a, b) => a + b, 0)
    return { taskId, title, repository, epic: null, plan, phase: null, startedAt: `2026-11-${at}T09:00:00Z`, finishedAt: `2026-11-${at}T10:00:00Z`, leadMs, activeMs: leadMs, stages, coarse: false, sources: ['tool-calls'], batch: null, firstPass: true }
  }
  const all = [
    mk('search.3', 'Index builder', 'acme/recipe-box', 'search', '15', { queued: 4 * min, coding: 30 * min, tests: 8 * min, 'ci-wait': 10 * min }),
    mk('search.4', 'Ranking', 'acme/recipe-box', 'search', '16', { queued: 2 * min, coding: 12 * min, 'ci-wait': 40 * min }),
    mk('pantry.1', 'Shelf list', 'acme/pantry', 'pantry', '14', { queued: 6 * min, coding: 20 * min, review: 15 * min }),
  ]
  const retros = [
    { id: 'retro-2', n: 2, state: 'done', triggers: [{ kind: 'count', detail: '10 tasks finished' }], startedAt: '2026-11-16T12:00:00Z', finishedAt: '2026-11-16T12:09:00Z', model: 'claude-sonnet', bottleneck: { stage: 'ci-wait', repository: 'acme/recipe-box', evidence: 'CI wait was 58% of lead time over 8 tasks.' }, dropped: [], proposals: [
      { id: 'p1', type: 'settings', file: 'workspace', key: 'flow.batch.max', from: 3, to: 5, metric: 'lead time', direction: 'down', evidence: 'Batches of 3 waited on CI 6 times.', status: 'open' },
      { id: 'p2', type: 'prompt', target: 'worker', section: 'Checks', diff: '@@ -1,2 +1,2 @@\n Run the checks.\n-Run all tests.\n+Run the tests you touched first.', metric: 'first-pass rate', direction: 'up', evidence: 'Two reviews asked for narrower runs.', status: 'open' },
    ] },
    { id: 'retro-1', n: 1, state: 'done', triggers: [{ kind: 'count', detail: '10 tasks finished' }], startedAt: '2026-11-12T12:00:00Z', finishedAt: '2026-11-12T12:08:00Z', bottleneck: null, dropped: [], proposals: [
      { id: 'p1', type: 'rule', text: 'Name the spec in every commit message.', metric: 'corrections', direction: 'down', evidence: { runs: ['search.1', 'search.2'], value: 2, effect: 'corrections' }, status: 'approved' },
    ] },
  ]
  answer('radar.flow', () => ({ readAt: null, count: 0, issues: [], skipped: [], median: null, medianLead: null, efficiency: null, bottleneck: null, errors: [], repositories: [] }))
  answer('flow.view', (body) => {
    const input = ((body as { input?: Record<string, string> }).input ?? {}) as Record<string, string>
    const tasks = all.filter((t) => (!input.repository || t.repository === input.repository) && (!input.plan || t.plan === input.plan) && (!input.stage || (t.stages[input.stage] ?? 0) > 0))
    const lead = tasks.length ? tasks.map((t) => t.leadMs).sort((a, b) => a - b)[Math.floor(tasks.length / 2)] : null
    const metrics = { tasks: tasks.length, leadTimeMs: lead, flowEfficiency: 0.6, firstPassRate: 1, changeFailureRate: 0, integrationsPerDay: null, timeToFixMs: null }
    const point = (t: (typeof all)[number]) => ({ key: t.finishedAt.slice(0, 10), tasks: 1, leadTimeMs: t.leadMs, flowEfficiency: 0.6, firstPassRate: 1, timeToFixMs: null, stages: t.stages })
    return {
      window: { size: Number(input.window ?? 20), since: null }, metrics, previous: metrics, bottleneck: null, tasks, stops: [], line: [], flaky: [], ciOnly: [], retros, batches: [],
      stages: ['queued', 'coding', 'tests', 'ci-wait', 'review'], repositories: ['acme/pantry', 'acme/recipe-box'], epics: [],
      plans: [{ id: 'pantry', title: 'Pantry' }, { id: 'search', title: 'Search' }], phases: [],
      series: { day: tasks.map(point), week: tasks.map(point) }, usage: noUsage,
    }
  })
  answer('flow.proposals', () => ({
    proposals: retros.flatMap((r) => r.proposals.map((p) => ({ retro: r.id, ...p }))), dropped: [],
    prompts: [{ target: 'worker', version: 'built-in', shipped: 'abc', active: 0, versions: [], sections: [], drift: [] }], notes: [], available: true,
  }))
  answer('flow.settings.get', () => ({ filename: '.avoozl.json', exists: true, hash: 'h', flow: {}, repositories: {}, instructions: '', retroPrompt: null, ciClassGlobs: {} }))
  answer('flow.retro.decide', () => ({ ok: true }))
}
// ?page=demo: the whole page, where Start demo opens the sample. Calls
// for the sample answer from window.__DEMO (demo-replies.mjs, built from
// the real sample); other calls answer as ?page=app does.
const demo = (window as unknown as { __DEMO?: { replies: Record<string, unknown>; previews: Record<string, string> } }).__DEMO
if (query.get('page') === 'demo' && demo) {
  let open = false
  answer('demo.start', () => ((open = true), { active: true, workspaceId: '@demo', existing: false, at: null }))
  answer('demo.exit', () => ((open = false), { active: false }))
  answer('demo.status', () => ({ active: open, workspaceId: '@demo' }))
  answer('demo.fixtures', () => demo.replies['demo.fixtures'])
  const names = new Set([...Object.keys(demo.replies), ...Object.keys(demo.previews)].filter((name) => !name.startsWith('demo.')))
  for (const name of names) {
    const before = replyFor(name)
    answer(name, (body) => {
      const call = body as { workspaceId?: string }
      if (call.workspaceId === '@demo') {
        if (name in demo.previews) throw new Refusal(409, { error: demo.previews[name], demo: true })
        return demo.replies[name]
      }
      if (before) return before(body)
      throw new Refusal(404, { error: 'The harness workspace has no reply for this.' })
    })
  }
}

// ?page=tip: a plain-text tooltip, an info icon, a button with a tooltip.
function TipPage() {
  const [clicks, setClicks] = useState(0)
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
      <Tooltip text="Opened 2026-11-14 by Mira"><span data-plain>opened 3 days ago</span></Tooltip>
      <span data-info-wrap><InfoTip text="Details that do not fit on the page" /></span>
      <Tooltip text="Stops all new work"><Btn data-act onClick={() => setClicks(clicks + 1)}>Stop</Btn></Tooltip>
      <span data-clicks>{clicks}</span>
      <button data-elsewhere>Elsewhere</button>
    </div>
  )
}

function Page() {
  if (query.get('page') === 'app') return <DeepLinkPage />
  if (query.get('page') === 'demo') return <DeepLinkPage />
  return (
    <>
      <div data-host-header style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 48, zIndex: 1000, display: 'flex', alignItems: 'center', padding: '0 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
        Host header
      </div>
      <div data-host-pane style={{ position: 'fixed', top: 48, left: 0, right: 0, bottom: 0, overflowY: 'auto', transform: 'translateZ(0)', background: 'var(--bg)', color: 'var(--text)' }}>
        <div {...{ [APP_ATTR]: '' }} style={{ display: 'contents' }}>
          <NavHistoryProvider>
            <ConfirmProvider>
              <TaskDrawerProvider workspaceId="w" onFocus={() => undefined}>
                <div style={{ display: 'flex', gap: 16, padding: 16, minHeight: 2400 }}>
                  <aside data-sticky-column style={{ position: 'sticky', top: 8, alignSelf: 'flex-start', zIndex: LAYER.sticky, width: '28%', minHeight: 300, padding: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                    Plans
                  </aside>
                  <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Card>
                      <Scenario name={query.get('modal') ?? ''} />
                    </Card>
                    <div data-graph>
                      <GraphView workspaceId="w" />
                    </div>
                  </main>
                </div>
              </TaskDrawerProvider>
            </ConfirmProvider>
          </NavHistoryProvider>
        </div>
      </div>
    </>
  )
}

// ?page=release-queue: the Release queue on fake rows, one of each state.
if (query.get('page') === 'release-queue') {
  const rows = [
    ['rc-1.1', 'Add the claim marker reader', 'released', 'Ready label is on. A crew has not claimed it yet.', 'Phase 1'],
    ['rc-1.2', 'Read the crew list', 'claimed', 'Claimed by Docs crew.', 'Phase 1'],
    ['rc-2.1', 'Project plans-repo issues into the code repository for the crews', 'next', 'Next in line.', 'Phase 2'],
    ['rc-2.2', 'Write the preview', 'held', 'Waiting for a free slot (2 of 2 in use). Next: unblocks 4 tasks.', 'Phase 2'],
    ['rc-2.3', 'Read the open pull requests once', 'held', 'Held: paths overlap #112 (open pull request); moves up in 7h.', 'Phase 2'],
    ['rc-3.1', 'Verify an issue before a crew builds it', 'held', 'Waiting on rc-2.1, rc-2.2.', 'Phase 3'],
    ['rc-4.1', 'Release engine', 'held', 'Phase Phase 4 waits for phase p3 to merge (rc-3.1, rc-3.2, rc-3.3).', 'Phase 4'],
    ['rc-5.1', 'Merge path check', 'held', 'Step: waiting for a click to release phase Phase 5.', 'Phase 5'],
    ['rc-5.2', 'Arm GitHub auto-merge', 'held', 'The line is stopped: bad base on main.', 'Phase 5'],
  ].map(([taskId, title, state, reason, phase], i) => ({ taskId, title, planId: 'radar-coder', spec: 'radar-coder', phase, scope: null, label: 'ready', number: 10 + i, url: null, manual: false, state, reason, used: 2, capacity: 2 }))
  answer('delivery.view', () => ({ revision: 1, items: [] }))
  answer('radar.releasequeue', () => ({
    repositories: [
      { repository: 'example/application-with-a-long-name', ready: 'ready', mode: 'step', capacity: 2, scopes: [], rows, steps: [{ planId: 'radar-coder', spec: 'radar-coder', phase: 'p5', title: 'Phase 5', released: false }] },
      { repository: 'example/docs', ready: 'ready', mode: 'hold', capacity: 0, scopes: [], rows: [{ ...rows[2], taskId: 'd-1', state: 'held', reason: 'Release mode is Hold. Add the ready label by hand to release it.' }], steps: [] },
    ],
  }))
}
function ReleaseModes() {
  const [modes, setModes] = useState(['automatic', 'step', 'hold'])
  return (
    <div className="flex flex-col gap-6">
      {modes.map((mode, i) => (
        <ReleaseModePicker key={i} id={`m${i}`} mode={mode} onMode={(value) => setModes(modes.map((m, at) => (at === i ? value : m)))} />
      ))}
    </div>
  )
}
// ?page=github-flow: Flow from GitHub data on two finished issues.
// &receipt=only: builds from a repository with receipts and no Radar crew,
// so no finished issues.
const buildsOnly = query.get('receipt') === 'only'
if (query.get('page') === 'github-flow' || (query.get('page') === 'app' && query.get('receipt')))
  answer('radar.flow', () => ({
    readAt: new Date(Date.now() - 4 * 60000).toISOString(),
    count: buildsOnly ? 0 : 2,
    issues: [],
    skipped: buildsOnly ? [] : [{ number: 61 }],
    median: buildsOnly ? null : [15 * 60000, 45 * 60000, 35 * 60000, 10 * 60000],
    medianLead: buildsOnly ? null : 105 * 60000,
    efficiency: buildsOnly ? null : 90 / 210,
    bottleneck: buildsOnly ? null : 'Claim to PR',
    errors: [],
    repositories: buildsOnly ? [] : ['acme/recipe-box'],
    ...(query.get('receipt')
      ? {
          builds: {
            count: 12,
            totalMs: 2280000,
            failedMs: 420000,
            medianMs: 160000,
            byPhase: [
              { phase: 'build', target: 'linux-x64/node26', start: 'warm', count: 8, medianMs: 38000 },
              { phase: 'test', target: 'linux-x64/node26', start: 'warm', count: 8, medianMs: 96000 },
              { phase: 'test', target: 'win32-x64/node26', start: 'cold', count: 2, medianMs: 174000 },
            ],
            byInstance: [
              { instance: 'inst-0a1b2c3d4e5f', name: 'Draco', count: 9, medianMs: 150000, totalMs: 1700000 },
              { instance: 'inst-f5e4d3c2b1a0', name: 'Cedar', count: 3, medianMs: 190000, totalMs: 580000 },
            ],
            recent: [
              { repository: 'acme/recipe-box', pr: 57, totalMs: 310000, failedMs: 120000, phases: [], costliest: { phase: 'test', ms: 180000 } },
              { repository: 'acme/recipe-box', pr: 55, totalMs: 140000, failedMs: 0, phases: [], costliest: { phase: 'build', ms: 80000 } },
            ],
          },
        }
      : {}),
  }))
// ?page=repo-mode: one repository's Edit body on its Mode and branch tab.
function RepoModePage() {
  const [repository, setRepository] = useState<RepositoryForm>(emptyRepository('acme/recipe-box'))
  const choices = { modes: ['local', 'plans-repo', 'single-repo'], authorities: [], coders: ['issue-radar', 'remote'], permissions: [], actions: [], fields: [], statusValues: [], managedLabels: [], crewLabels: [] }
  return (
    <NavHistoryProvider>
      <RepositoryEditor index={0} repository={repository} choices={choices as never} review={undefined} mode="single-repo" workspaceId="w" planningRepository="" onChange={setRepository} />
    </NavHistoryProvider>
  )
}

// ?page=workspaces: Settings > Workspaces on two workspaces; window.__wsCalls
// records stop and remove. &stopped=1 starts the first one turned off.
const wsWin = window as unknown as { __wsCalls: string[] }
if (query.get('page') === 'workspaces') {
  wsWin.__wsCalls = []
  let items = [
    { id: 'launch', name: 'Product launch', root: '/plans/launch', enabled: query.get('stopped') !== '1', state: query.get('stopped') === '1' ? 'stopped' : 'closed', served: true },
    { id: 'nupp', name: 'Nupp plans', root: '/plans/nupp', enabled: true, state: 'closed', served: false },
  ]
  answer('workspaces.list', () => ({ defaultWorkspace: items[0]?.id ?? null, items }))
  answer('workspaces.stop', (body) => {
    const id = (body as { input: { id: string } }).input.id
    wsWin.__wsCalls.push(`stop ${id}`)
    items = items.map((item) => (item.id === id ? { ...item, enabled: false, state: 'stopped' } : item))
    return items.find((item) => item.id === id)
  })
  answer('workspaces.remove', (body) => {
    const id = (body as { input: { id: string } }).input.id
    wsWin.__wsCalls.push(`remove ${id}`)
    const gone = items.find((item) => item.id === id)!
    items = items.filter((item) => item.id !== id)
    return { id, root: gone.root, removed: true, databasePreserved: true }
  })
  answer('workspaces.update', (body) => {
    const { id, ...change } = (body as { input: { id: string; name?: string; root?: string } }).input
    wsWin.__wsCalls.push(`update ${id} ${JSON.stringify(change)}`)
    if (change.root === '/bad') throw new Refusal(400, { error: 'No Avoozl workspace in /bad.' })
    items = items.map((item) => (item.id === id ? { ...item, ...change } : item))
    return items.find((item) => item.id === id)
  })
  answer('workspace.tick.health', () => ({ lastRun: null, lock: null }))
  answer('workspace.tick.log', () => ({ items: [] }))
}

// The folder picker's reads (workspaces.browse) on every page: a small home
// folder at /me with one workspace in it.
const FOLDERS: Record<string, string[]> = { '/me': ['code', 'plans', 'notes'], '/me/plans': ['launch', 'nupp'], '/me/code': [] }
answer('workspaces.browse', (body) => {
  const asked = (body as { input: { path?: string } }).input.path?.replace(/^~(?=\/|$)/, '/me').replace(/\/$/, '') || '/me'
  const at = asked in FOLDERS ? asked : '/me'
  return {
    path: at,
    home: '/me',
    parent: at === '/me' ? null : at.slice(0, at.lastIndexOf('/')),
    workspace: at.startsWith('/me/plans/'),
    truncated: false,
    folders: (FOLDERS[at] ?? []).map((name) => ({ name, path: `${at}/${name}`, workspace: at === '/me/plans' })),
  }
})

// The app shell answers too, so Settings › Models can be shot in place.
if (query.get('page') === 'models' || query.get('page') === 'app') {
  let settings = {
    filename: '.avoozl.json',
    exists: true,
    hash: 'models-before',
    models: { planner: 'fake-writer' },
    harnesses: {},
    harnessDefinitions: [
      { name: 'claude-code', approved: true },
      { name: 'codex', approved: false },
    ],
  }
  answer('GET /api/models', () => ['fake-writer', 'fake-reviewer'])
  answer('models.settings.get', () => settings)
  answer('models.settings.update', (body) => {
    state.calls.push(body)
    const input = body.input as { models: typeof settings.models; harnesses?: typeof settings.harnesses }
    settings = { ...settings, hash: 'models-after', models: input.models, harnesses: input.harnesses ?? settings.harnesses }
    return settings
  })
}

const PAGES: Record<string, () => ReactNode> = {
  workspaces: () => <WorkspaceView selected="launch" />,
  models: () => <ModelsSettings workspaceId="w" />,
  // The GitHub calls of the last hour by source, beside the live limit.
  'github-usage': () => (
    <RateBlock
      rate={{
        resources: { core: { limit: 5000, remaining: 1078, resetAt: new Date(Date.now() + 22 * 60000).toISOString() }, graphql: { limit: 5000, remaining: 4890, resetAt: new Date(Date.now() + 40 * 60000).toISOString() } },
        limitedUntil: null,
        limitedResource: null,
        calls: 214,
        notModified: 61,
        notModifiedShare: 61 / 214,
        hourCalls: 153,
        writes: { perMinute: 60, perHour: 400, run: { planId: 'nupp', done: 312, total: 1740, resumeAt: new Date(Date.now() + 38 * 60000).toISOString() } },
        bySource: { tick: { calls: 88, notModified: 40, cached: 0 }, crew: { calls: 41, notModified: 0, cached: 0 }, view: { calls: 17, notModified: 21, cached: 132 }, review: { calls: 5, notModified: 0, cached: 3 }, setup: { calls: 2, notModified: 0, cached: 0 } },
      }}
    />
  ),
  'repo-mode': () => <RepoModePage />,
  'github-flow': () => <GithubFlow workspaceId="w" />,
  'release-queue': () => <ReleaseQueue workspaceId="w" />,
  'release-mode': () => <ReleaseModes />,
  // The two modals, open at once, for the screenshots.
  projection: () => <ProjectionModal workspaceId="w" client={projections} planId="search-v2" title="Search v2" onClose={() => undefined} onCreated={() => undefined} />,
  'spec-changed': () => <SpecChangedModal workspaceId="w" client={projections} planId="search-v2" title="Search v2" onClose={() => undefined} onApplied={() => undefined} />,
  // Who codes in each mode: default, a set value, and Local only.
  coder: () => (
    <div className="flex flex-col gap-6">
      {[['single-repo', ''], ['plans-repo', 'remote'], ['', '']].map(([mode, value]) => (
        <CoderPicker key={mode} id={`c-${mode || 'local'}`} mode={mode} value={value} onChange={() => {}} />
      ))}
    </div>
  ),
}
function SettingsPage({ name }: { name: string }) {
  const render = PAGES[name]
  return (
    <div {...{ [APP_ATTR]: '' }} data-settings-page={name} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <ConfirmProvider>{render ? render() : <p>Unknown page {name}</p>}</ConfirmProvider>
    </div>
  )
}


// ?page=intake: Settings > Plugins with its Intake sources, on fake data
// (intake-fixture.ts); &empty=1 with no source. For the intake screenshots.
function IntakePage() {
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <NavHistoryProvider>
        <ConfirmProvider>
          <div data-intake-page style={{ padding: 16 }}>
            <PluginsSettings workspaceId="w" />
          </div>
        </ConfirmProvider>
      </NavHistoryProvider>
    </div>
  )
}

function AppPage() {
  return (
    <div data-host-pane style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--bg)', color: 'var(--text)' }}>
      <AvoozlApp />
    </div>
  )
}

// ?page=activity: the Activity tab alone, with rows from every source, many
// kinds and four people, filtered as activity.list filters them.
if (query.get('page') === 'activity' || query.get('activity') === '1') {
  const kinds = ['dispatch', 'settings', 'github.close', 'approve', 'board.move', 'label', 'stop', 'resume', 'session.end', 'plugin.sync']
  const sources = ['local', 'github', 'mcp', 'plugin']
  const actors = ['mira', 'worker-chat', 'octo-reviewer', 'github-actions']
  const all = Array.from({ length: 24 }, (_, at) => {
    const seq = 24 - at
    return { seq, at: new Date(Date.parse('2026-11-13T10:00:00Z') - at * 3600e3).toISOString(), source: sources[at % 4], actor: actors[(at * 3) % 4], kind: kinds[at % kinds.length], summary: `${kinds[at % kinds.length]} entry ${seq}`, targetId: null, link: null, redacted: false }
  })
  const count = (key: 'source' | 'kind' | 'actor') => {
    const out: Record<string, number> = {}
    for (const row of all) out[row[key]] = (out[row[key]] ?? 0) + 1
    return out
  }
  answer('activity.list', (body) => {
    const input = body.input as { source?: string; kind?: string; actor?: string }
    const items = all.filter((row) => (!input.source || row.source === input.source) && (!input.kind || row.kind === input.kind) && (!input.actor || row.actor === input.actor))
    return { items, total: items.length, sources: [...sources].sort(), kinds: [...kinds].sort(), actors: [...actors].sort(), counts: { source: count('source'), kind: count('kind'), actor: count('actor') }, retentionDays: 30 }
  })
  let keepDays = 30
  answer('activity.settings.get', () => ({ hash: 'h', retentionDays: keepDays, default: 30 }))
  answer('activity.settings.update', (body) => {
    const input = body.input as { retentionDays: number | null }
    keepDays = input.retentionDays ?? 30
    return { hash: 'h', retentionDays: keepDays, default: 30 }
  })
}
function ActivityPage() {
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)' }}>
      <NavHistoryProvider>
        <ConfirmProvider>
          <TaskDrawerProvider workspaceId="w" onFocus={() => undefined}>
            <ActivityView workspaceId="w" />
          </TaskDrawerProvider>
        </ConfirmProvider>
      </NavHistoryProvider>
    </div>
  )
}

// ?page=specs: the Specs tab alone, with drafts in two approval batches.
if (query.get('page') === 'specs' || query.get('specs') === '1') {
  const spec = (name: string, status: string, total: number, extra = {}) => ({
    key: `spec:${name}`,
    kind: 'spec',
    name,
    spec: name,
    folder: `.kiro/specs/${name}`,
    planId: status === 'not imported' ? null : name,
    type: 'feature',
    category: null,
    categoryProblem: null,
    errors: 0,
    status,
    tasks: { total, done: status === 'approved' ? 1 : 0 },
    now: { ready: 0, running: 0, needsYou: 0 },
    epic: null,
    epicTitle: null,
    lastChange: null,
    ...extra,
  })
  // Epics and update times for the nav's Epics chips and Sort rows.
  const runtime = { epic: 'runtime', epicTitle: 'Runtime core' }
  const tooling = { epic: 'tooling', epicTitle: 'Developer tooling' }
  const at = (day: number) => ({ lastChange: `2026-11-${String(day).padStart(2, '0')}T12:00:00Z` })
  const items = [
    spec('byte-types', 'draft', 8, { ...runtime, ...at(14) }),
    spec('compression', 'draft', 12, { ...runtime, ...at(15) }),
    spec('core-design-values', 'draft', 4, at(9)),
    spec('math-matrix-math', 'draft', 5, { ...tooling, ...at(11) }),
    spec('public-cli-module', 'draft', 3, { ...tooling, ...at(16) }),
    spec('allocator', 'draft', 7, { ...runtime, ...at(12) }),
    spec('nupp-native-runtime-winddown-2026-11-11', 'draft', 131, { ...runtime, ...at(13) }),
    spec('load-config', 'approved', 3, { onGitHub: true, ...at(8) }),
    spec('window-design', 'not imported', 10),
  ]
  const entry = (id: string, batch: number, tasks: number, hash: string, extra = {}) => ({ id, spec: id, title: id, hash: hash.repeat(64 / hash.length), batch, tasks, errors: 0, loop: false, needs: [], ...extra })
  const batches = [
    { batch: 1, specs: [entry('core-design-values', 1, 4, 'b9dc37bf'), entry('math-matrix-math', 1, 5, 'b18266e9'), entry('public-cli-module', 1, 3, '4b5afd31')] },
    { batch: 2, specs: [entry('byte-types', 2, 8, '98f38c3b', { loop: true, needs: ['compression', 'core-design-values'] }), entry('compression', 2, 12, 'f1551aa3', { loop: true, needs: ['byte-types'] }), entry('nupp-native-runtime-winddown-2026-11-11', 2, 131, '3a271abe', { loop: true, needs: ['compression'] })] },
    { batch: 3, specs: [entry('allocator', 3, 7, '4fb54994', { needs: ['byte-types'] })] },
  ]
  answer('plan.table', () => ({ root: '/repo', problem: null, specs: [], revision: 7, items }))
  // &review=1: byte-types is stored and reviewed, so its page has Open
  // review (ReviewView.tsx) on fake findings (review-fixture.ts).
  if (query.get('review') === '1') {
    const fixture = reviewFixture()
    const hash = fixture.data.revisionHash
    const files = fixture.data.files
    let at = hash
    const summary = { name: 'byte-types', folder: '.kiro/specs/byte-types/', type: 'feature', hash, files: Object.keys(files), counts: { error: 0, warning: 0, info: 0 }, taskCount: 2, critique: null, plan: { id: 'byte-types', state: 'draft', hash, revision: 3, changed: false, approved: false } }
    answer('plan.table', () => ({ root: '/repo', problem: null, specs: [summary], revision: 7, items }))
    answer('plan.preview', () => ({ reviewedHash: at, expectedRevision: 3, tasks: [], dependencies: [] }))
    answer('plan.spec.read', () => ({ name: 'byte-types', folder: '.kiro/specs/byte-types/', hash, documents: files }))
    answer('plan.review.view', () => structuredClone(fixture.data))
    // The Approve dialogs' summary (task 57.6): counts by severity and state.
    // window.__moveRevision() stands for the planner writing a revision while
    // a dialog is open: one finding becomes fixed and one moves.
    for (const batch of batches) for (const spec of batch.specs) if (spec.id === 'byte-types') spec.hash = hash
    const moved = 'd00dfeed'.repeat(8)
    const movedFiles = { ...files, 'requirements.md': files['requirements.md'] + '\n3. A test SHALL show 255 + 1 wraps to 0.', 'tasks.md': files['tasks.md'] + '\n- [ ] 1.3 Test overflow wraps' }
    ;(window as unknown as { __moveRevision: () => void }).__moveRevision = () => { at = moved }
    const reviewOf = () => {
      const now = at === moved
      const open = fixture.data.findings.filter((f) => f.state !== 'rejected').map((f) => ({
        id: f.id, roundId: f.roundId, revisionHash: f.revisionHash, current: true, kind: f.category, severity: f.severity, file: f.anchor.file, line: f.anchor.lineStart, claim: f.claim, evidence: f.evidence, answer: f.answer,
        state: now && f.id === 'f-blocker' ? 'fixed' : f.state,
        anchor: { ...f.anchor, moved: f.id === 'f-moved' ? now : false },
      }))
      const byState: Record<string, number> = { rejected: 1 }
      for (const f of open) byState[f.state] = (byState[f.state] ?? 0) + 1
      // Open findings by severity, live as the person decides them.
      const openBySeverity = { blocker: 0, warn: 0, info: 0 }
      for (const f of fixture.data.findings) if (['open', 'answered', 'for you', 'accepted'].includes(f.state)) openBySeverity[f.severity]++
      const summary = query.get('summary') === 'none' ? null : { text: 'Adds fixed-width byte types and byte strings to the runtime, with UTF-8 conversion. It covers three requirements and two tasks.', revisionHash: hash, current: !now }
      return { state: 'done', planHash: at, reviewerModel: 'fake-reviewer', writerModel: 'fake-writer', revisionHash: hash, current: !now, found: fixture.data.findings.length, fixed: byState.fixed ?? 0, forYou: byState['for you'] ?? 0, bySeverity: fixture.data.bySeverity, openBySeverity, byState, summary, note: null, open }
    }
    const entryHash = (id: string) => batches.flatMap((b) => b.specs).find((e) => e.id === id)?.hash
    answer('plan.reviewSummary', (body) => {
      const id = (body.input as { planId: string }).planId
      return id === 'byte-types' ? reviewOf() : { state: 'not-reviewed', planHash: entryHash(id), reviewerModel: null, revisionHash: null, current: false, found: 0, fixed: 0, forYou: 0, bySeverity: { blocker: 0, warn: 0, info: 0 }, byState: {}, note: null, open: [] }
    })
    answer('plan.get', () => ({
      id: 'byte-types', spec: 'byte-types', title: 'Byte types', hash: at, revision: at === moved ? 4 : 3, state: 'draft', files: at === moved ? movedFiles : files, approvals: [],
      history: at === moved ? [{ revision: 3, hash, files }] : [],
      quality: { canApprove: true, counts: { error: 0, warning: 0, info: 0 }, diagnostics: [] },
      disk: { folder: '.kiro/specs/byte-types/', exists: true, hash: at, changed: false, critique: null },
      review: reviewOf(),
    }))
    answer('plan.review.finding.decide', (body) => {
      state.calls.push(body as never)
      fixture.decide(body.input as Parameters<typeof fixture.decide>[0])
      return {}
    })
  }
  const writes: Record<string, number> = { 'byte-types': 14, compression: 21, 'nupp-native-runtime-winddown-2026-11-11': 268 }
  answer('plan.approvalBatches', (body) => {
    const ids = (body.input as { ids?: string[] } | undefined)?.ids
    if (!ids) return { batches }
    const specs = batches.flatMap((b) => b.specs).filter((e) => ids.includes(e.id)).map((e) => ({ ...e, writes: writes[e.id] ?? 3 }))
    return { batches, selection: { ok: true, specs, writes: specs.reduce((n, e) => n + e.writes, 0), failures: [], missing: [] } }
  })
  answer('plan.approveMany', (body) => {
    state.calls.push(body as never)
    return { ok: true, approved: [], failures: [] }
  })
}
function SpecsPage() {
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)' }}>
      <NavHistoryProvider>
        <ConfirmProvider>
          <TaskDrawerProvider workspaceId="w" onFocus={() => undefined}>
            <PlansView workspaceId="w" />
          </TaskDrawerProvider>
        </ConfirmProvider>
      </NavHistoryProvider>
    </div>
  )
}

function HomePage() {
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)' }}>
      <NavHistoryProvider>
        <ConfirmProvider>
          <TaskDrawerProvider workspaceId="w" onFocus={() => undefined}>
            <DashboardView workspaceId="w" onNavigate={() => undefined} />
          </TaskDrawerProvider>
        </ConfirmProvider>
      </NavHistoryProvider>
    </div>
  )
}

// ?page=app&epics=empty|full: the Epics screen above the spec list.
const RADAR_GRAPH = { url: '/issue-radar', focus: false }
if (query.get('epics') === 'empty') {
  answer('epics.view', () => ({ epics: [], unprojected: [], radarGraph: RADAR_GRAPH }))
}
if (query.get('epics') === 'full') {
  const phase = (id: string, title: string, gate: string, total: number, merged: number, released: number, held: string | null) => ({ id, title, gate, total, merged, released, held })
  answer('epics.view', () => ({
    epics: [
      {
        id: 'search-v2',
        title: 'Search v2',
        tasks: 12,
        merged: 5,
        running: 1,
        plans: [
          { id: 'search-v2', title: 'Plan v3', state: 'approved', phases: [phase('p1', 'Index', 'passed', 3, 3, 3, null), phase('p2', 'Ranking', 'open', 4, 0, 1, '3 wait on #52 (CI)'), phase('p3', 'Cache', 'closed', 5, 0, 0, 'Phase Ranking waits for phase Index to merge.')] },
          { id: 'search-docs', title: 'Docs', state: 'approved', phases: [phase('d1', 'Write', 'open', 1, 0, 0, null)] },
        ],
      },
    ],
    unprojected: [{ id: 'notes', title: 'Notes export', state: 'draft', tasks: 4, reason: 'Draft spec. Not approved. Approve it in the Spec Builder chat or its side panel.' }],
    radarGraph: RADAR_GRAPH,
  }))
}
const page = query.get('page')
// ?page=needs: Needs you's list column with four open items, for the filter
// row and the count shown once.
if (page === 'needs') {
  const it = (n: number, kind: string) => ({ key: `k${n}`, kind, taskId: `t${n}`, title: `Item ${n}`, detail: 'Waits on you.', plan: 'meal-planner', epic: null, repository: 'example/recipe-box', since: '2026-11-14T10:00:00Z' })
  answer('conflicts.view', () => ({ revision: 1, items: query.get('draftReview') === '1' ? [{
    id: 'draft-review-1', kind: 'plan-review', taskId: null, plan: 'reader', title: 'Review draft reader?',
    detail: 'Read this draft on a different model, or skip this revision.',
    planReview: { planId: 'reader', revisionHash: 'a'.repeat(64) },
  }] : [it(1, 'decision'), it(2, 'decision'), it(3, 'needs-human'), it(4, 'review')] }))
  answer('plan.review.decide', (body) => {
    state.calls.push(body)
    if (query.get('draftDelay') === '1') return new Promise((resolve) => {
      window.addEventListener('release-draft-review', () => resolve({ state: (body.input as { action: string }).action }), { once: true })
    })
    return { state: (body.input as { action: string }).action }
  })
  answer('delivery.view', () => ({ revision: 1, items: [] }))
}
function NeedsPage() {
  const [workspaceId, setWorkspaceId] = useState('w')
  return <>
    {query.get('draftReview') === '1' && <button data-review-workspace={workspaceId} onClick={() => setWorkspaceId('other')}>Switch workspace</button>}
    <ConflictsView workspaceId={workspaceId} />
  </>
}
// ?page=radar-values[&grant=1]: the Radar values screen on a fake Radar read.
if (page === 'radar-values') {
  const grant = query.get('grant') === '1'
  const item = (id: string, label: string, value: string, status: string) => ({ id, label, value, controls: `What ${label} controls.`, status, note: status === 'ok' ? 'Issue Radar shows this value.' : 'Tick it yourself.' })
  const long = 'For any issue with an <!-- avoozl --> marker, run `avoozl verify-issue OWNER/REPO#N` (or the plans_verify_issue tool) first; build only if it exits 0, otherwise skip it with scope needs-decision and say which check failed.'
  answer('radar.values', () => ({
    repository: 'example/code',
    grant,
    link: '/issue-radar',
    items: [
      item('repository', 'Repository to connect', 'example/code', grant ? 'ok' : 'cannot-verify'),
      item('agent', 'Agent', 'avoozl-crew', grant ? 'ok' : 'cannot-verify'),
      item('scope', 'Label scope', 'ready', grant ? 'differs' : 'cannot-verify'),
      item('prompt', 'Additional prompt', long, 'cannot-verify'),
    ],
  }))
}
// ?page=forward[&state=ok|blocked|stopped]: the Forward screen on replies the
// real operations gave in the live scratch run (forward-live-replies.json).
if (page === 'forward') {
  const state = query.get('state') ?? 'ok'
  answer('mirror.forward.review', () =>
    state === 'blocked' ? { ok: false, blocked: true, reason: forwardLive.blockedReason } : state === 'stopped' ? { ok: false, stopped: forwardLive.stopped, review: forwardLive.review } : { ok: true, ready: true, review: forwardLive.review },
  )
}
const intake = page === 'intake'
if (intake) answerIntake(query.get('empty') === '1')

// ?page=panel&sid=<chat>&state=full|empty: the side panel on sample reads.
// window.__panel holds what the reads return, so a test can change it and see
// the panel read again; window.__panelReads counts the reads and
// window.__panelCalls records writes.
type PanelData = { conflicts: unknown[]; crews: unknown[]; remote: unknown[]; queue: unknown[]; tasks: unknown[]; line: unknown[]; specs: unknown[]; fail?: string }
const panelWin = window as unknown as { __panel: PanelData; __panelReads: number; __panelCalls: unknown[] }
const panelClaim = (number: number, crewId: string, crewName: string, phase: string, pr: number | null) => ({ repository: 'acme/recipe-box', number, title: number === 52 ? 'Index builder' : 'Ranking tests', url: `https://github.test/acme/recipe-box/issues/${number}`, crewId, crewName, phase, pr, prUrl: pr ? `https://github.test/acme/recipe-box/pull/${pr}` : null, updated: new Date(Date.now() - 600000).toISOString(), commentUrl: null, stale: false, noMarker: false, instanceId: 'inst-1', claimedAt: new Date(Date.now() - 1500000).toISOString() })
const panelRow = (taskId: string, state: string, reason: string) => ({ taskId, title: `Task ${taskId}`, planId: 'search-v2', spec: 'search-v2', phase: 'one', scope: null, label: 'ready', number: null, url: null, manual: false, state, reason, used: 0, capacity: 2 })
if (page === 'panel') {
  const full = query.get('state') !== 'empty'
  panelWin.__panelReads = 0
  panelWin.__panelCalls = []
  panelWin.__panel = {
    conflicts: full
      ? [
          { kind: 'needs-human', reason: 'crew', taskId: null, title: '#52 asks about the tokenizer', detail: 'Draco: tokenizer A or B? Crew paused with the needs-human label.', link: 'https://github.test/acme/recipe-box/issues/52' },
          { kind: 'github-conflict', taskId: 'S8', field: 'title', title: 'Ranking: acceptance edited', detail: 'Someone changed the title on GitHub.', choices: ['desired', 'github'] },
          { kind: 'stale-session', taskId: 'S9', title: 'A retired worker row', detail: 'must not show' },
        ]
      : [],
    crews: full ? [panelClaim(52, 'abc', 'Draco', 'CI', 57), panelClaim(58, 'def', 'Orla', 'working', 59)] : [],
    remote: full ? [{ host: 'box', crewId: 'r1', taskId: 'S5', state: 'running', chatKey: 'k', status: 'working', updatedAt: new Date().toISOString(), attachUrl: 'https://box.test/chat?sid=k', stale: false, lastOkAt: null }] : [],
    queue: full ? [panelRow('S9', 'next', 'Waits on #52, then it is next.'), panelRow('S10', 'held', 'Held by the line.')] : [],
    tasks: full ? [{ taskId: 'S4', title: 'Tokenizer', repository: 'acme/recipe-box', finishedAt: new Date(Date.now() - 3600000).toISOString() }] : [],
    line: [],
    specs: [{ name: 'search-v2', folder: '.kiro/specs/search-v2', type: 'feature', hash: 'h', files: ['requirements.md', 'design.md', 'tasks.md'], counts: { error: 0, warning: 1 }, taskCount: 12, critique: null, plan: { id: 'search-v2', state: 'draft', hash: 'h', revision: 1, changed: false, approved: false } }],
  }
  const data = () => {
    if (panelWin.__panel.fail) throw Object.assign(new Error('down'), { status: 500, body: '{"error":"down"}' })
    return panelWin.__panel
  }
  answer('workspaces.list', () => ({ defaultWorkspace: 'w', items: [{ id: 'w', name: 'Harness', root: '/w', enabled: true, state: 'ready', served: true }] }))
  // ?places=1: two workspaces, Avoozl's (/w) and Nupp's (/n, whose code
  // checkout is /src/nupp), and chats whose project folders sit in each.
  if (query.get('places')) {
    answer('workspaces.list', () => ({ defaultWorkspace: 'w', items: [{ id: 'w', name: 'Avoozl plans', root: '/w', enabled: true, state: 'ready', served: true }, { id: 'nupp', name: 'Nupp plans with a long name', root: '/n', enabled: true, state: 'ready', served: false }] }))
    answer('repositories.list', (body) => ({ items: (body as { workspaceId?: string }).workspaceId === 'nupp' ? [{ id: 'nupp', name: 'nupp', localCheckout: '/src/nupp', github: 'o/nupp', baseBranch: 'main' }] : [{ id: 'av', name: 'avoozl', localCheckout: '/src/avoozl', github: 'o/avoozl', baseBranch: 'main' }] }))
    answer('GET /api/chat/slots', () => [
      { key: 'nupp-chat', project: '/src/nupp/compiler' },
      { key: 'avoozl-chat', project: '/src/avoozl' },
      { key: 'elsewhere-chat', project: '/srv/other' },
    ])
  }
  // The one read the panel makes. A failed part is null, as in the backend.
  const part = <T,>(read: () => T): T | null => {
    try {
      return read()
    } catch {
      return null
    }
  }
  answer('panel.view', () => {
    panelWin.__panelReads += 1
    const crews = part(() => data().crews as { pr: number | null; repository: string }[])
    return {
      readAt: new Date().toISOString(),
      conflicts: part(() => data().conflicts),
      crews: crews && { readAt: null, stale: 0, errors: [], unseen: [], rows: crews, groups: [{ instanceId: 'inst-1', name: 'Kelp', own: true, rows: crews }] },
      remote: part(() => data().remote),
      queue: part(() => ({ repositories: [{ repository: 'acme/recipe-box', ready: 'ready', mode: 'automatic', capacity: 2, scopes: [], steps: [], rows: data().queue }] })),
      flow: part(() => ({ tasks: data().tasks, line: data().line })),
      specs: part(() => data().specs),
      instance: { id: 'inst-1', name: 'Kelp' },
      checks: crews && Object.fromEntries(crews.filter((c) => c.pr).map((c, i) => [`${c.repository}#${c.pr}`, i === 0 ? { state: 'passing', total: 3, done: 3, failed: [] } : { state: 'failing', total: 3, done: 3, failed: ['test'] }])),
    }
  })
  answer('github.conflict.resolve', (body) => (panelWin.__panelCalls.push(body.input), {}))
  // The line, read by the pause button: ?stopped=1 opens a stop; Resume closes it.
  let panelStops = query.get('stopped') ? [{ id: 'l1', manual: true, reason: 'bad base', scope: 'all', closedAt: null, branch: 'main', check: null }] : []
  answer('flow.view', () => ({ line: panelStops, stages: [], tasks: [], retros: [] }))
  answer('flow.resume', (body) => (panelWin.__panelCalls.push({ resume: (body.input as { stopId?: string }).stopId }), (panelStops = []), { stop: { id: 'l1', closedAt: new Date().toISOString() } }))
  answer('GET /api/apps/spec-builder/specs', () => ({ specs: [{ name: 'search-v2' }] }))
}
// ?page=panel&real=1: the panel on the replies a real backend gave over the
// sample workspace (window.__REAL_PANEL, panel-real.test.mjs), so a reply that
// drifts from what the panel reads shows up here and not only in a live host.
const realPanel = (window as unknown as { __REAL_PANEL?: Record<string, unknown> }).__REAL_PANEL
if (page === 'panel' && query.get('real') === '1' && realPanel) {
  answer('panel.view', () => realPanel['panel.view'])
  answer('GET /api/apps/spec-builder/specs', () => ({ specs: (((realPanel['panel.view'] as { specs?: { name: string }[] }).specs ?? [])).map((item) => ({ name: item.name })) }))
}
class HarnessBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: unknown) {
    return { error: String((error as Error)?.stack ?? error) }
  }
  render() {
    return this.state.error ? <pre data-harness-crash>{this.state.error}</pre> : this.props.children
  }
}
function ForwardPage() {
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <HarnessBoundary>
        <ForwardScreen workspaceId="w" forwardId="live" title="Forward mirror pull request #7" onClose={() => {}} />
      </HarnessBoundary>
    </div>
  )
}
function RadarValuesPage() {
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <HarnessBoundary>
        <RadarValuesScreen workspaceId="w" repositories={['example/code']} />
      </HarnessBoundary>
    </div>
  )
}
// ?page=crews-rules: the Crews and rules tab on one repository form.
function CrewsRulesPage() {
  const [repository, setRepository] = useState<RepositoryForm>(emptyRepository('example/code'))
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <HarnessBoundary>
        <CrewsRulesSettings id="t" repository={repository} set={(change) => setRepository((before) => ({ ...before, ...change }))} />
        <pre data-form style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ rules: repository.reviewRules, plan: repository.planLabel })}</pre>
      </HarnessBoundary>
    </div>
  )
}
// ?page=tracker-gates: an open, a failed and a cleared gate, and the Waiting on you filter.
const GATES: GateRow[] = [
  { taskId: 'sdk.1', title: 'Wait for the review to ship', tracker: 'ticket-tracker', item: 'REV-1', done: 'the review shipped to the live release', state: 'open', lastCheck: '2026-11-14T12:00:00Z', nextCheck: '2026-11-14T12:02:00Z', evidence: 'In review', link: null, cleared: null, needsYou: false, held: ['sdk.2'] },
  { taskId: 'sdk.5', title: 'A very long gate title that has to wrap on a phone without any sideways scrolling at all', tracker: 'ticket-tracker', item: 'https://tracker.example.test/a/very/long/path/that/must/wrap/REV-2', done: 'resolved', state: 'failed', lastCheck: '2026-11-14T12:00:00Z', nextCheck: '2026-11-14T12:30:00Z', evidence: 'Rejected by the owner', link: 'https://tracker.example.test/REV-2', cleared: null, needsYou: true, held: [] },
  { taskId: 'sdk.6', title: 'Cut over', tracker: 'ticket-tracker', item: 'REV-3', done: 'resolved', state: 'cleared', lastCheck: null, nextCheck: null, evidence: null, link: null, cleared: { actor: 'alice', how: 'command', at: '2026-11-14T13:00:00Z', reason: 'Shipped by hand.', lastState: 'failed' }, needsYou: false, held: [] },
]
function TrackerGatesPage() {
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <HarnessBoundary>
        <GateList gates={GATES} onClear={() => undefined} />
        <pre data-waiting>{waitingGates(GATES).map((row) => row.taskId).join(',')}</pre>
      </HarnessBoundary>
    </div>
  )
}
// ?page=workflow-map&config=single|plans|local: the Workflow map drawn from a
// real policy through toForm, with the Crews and rules fields beside it so a
// jump has somewhere to land.
const WORKFLOW_POLICIES: Record<string, { mode: string; policy: Record<string, unknown> }> = {
  single: {
    mode: 'single-repo',
    policy: {
      mode: 'single-repo',
      repositories: {
        'example/code': {
          baseBranch: 'main',
          coder: 'issue-radar',
          allowedActors: ['sam', 'lee'],
          release: { capacity: 3, mode: 'step' },
          managedLabels: { ready: 'go-crew' },
          crewLabels: { claim: 'taken', needsHuman: 'wants-person' },
          radar: { planLabel: 'shape-it', approvalLabel: 'ship-it', conflictLabel: 'rebase-me' },
        },
      },
    },
  },
  plans: {
    mode: 'plans-repo',
    policy: {
      mode: 'plans-repo',
      planningRepository: 'example/plans',
      repositories: { 'example/code': { baseBranch: 'main', coder: 'worker', concurrency: 4, minimumPermission: 'maintain' } },
    },
  },
  local: { mode: 'local', policy: { mode: 'local', repositories: { 'example/code': { baseBranch: 'trunk', coder: 'issue-radar', radar: { planLabel: 'kept-but-unused' } } } } },
}
function WorkflowMapPage() {
  const config = WORKFLOW_POLICIES[query.get('config') ?? 'single']
  const form = toForm(config.policy as never)
  const [repository, setRepository] = useState<RepositoryForm>(form.repositories[0])
  answer('delivery.settings.get', () => ({ hash: null, on: true, delivery: query.get('ship') === 'manual' ? { ship: 'manual' } : {} }))
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <HarnessBoundary>
        <WorkflowMap workspaceId="w" mode={config.mode} repository={repository} planningRepository={form.planningRepository} onJump={(jump) => focusField('t', jump)} />
        <CrewsRulesSettings id="t" repository={repository} set={(change) => setRepository((before) => ({ ...before, ...change }))} />
      </HarnessBoundary>
    </div>
  )
}
function PanelPage() {
  return (
    <div style={{ width: window.innerWidth <= 640 ? '100%' : 360, padding: 0, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <HarnessBoundary>
        <AvoozlPanel />
      </HarnessBoundary>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(
  page === 'needs' ? <NeedsPage /> : page === 'specs' ? <SpecsPage /> : page === 'tip' ? <TipPage /> : page === 'panel' ? <PanelPage /> : page === 'workflow-map' ? <WorkflowMapPage /> : page === 'crews-rules' ? <CrewsRulesPage /> : page === 'tracker-gates' ? <TrackerGatesPage /> : page === 'radar-values' ? <RadarValuesPage /> : page === 'forward' ? <ForwardPage /> : intake ? <IntakePage /> : page === 'home' ? <HomePage /> : page === 'activity' ? <ActivityPage /> : page && page !== 'app' && page !== 'demo' ? <SettingsPage name={page} /> : query.get('app') ? <AppPage /> : <Page />,
)

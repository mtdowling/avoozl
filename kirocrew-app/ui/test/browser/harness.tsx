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
import { TracePage } from '../../src/TraceView.tsx'
import GraphView from '../../src/GraphView.tsx'
import AddPlugin from '../../src/AddPlugin.tsx'
import Onboard from '../../src/Onboard.tsx'
import { RepositoryDialog } from '../../src/RepositoriesSettings.tsx'
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
import { chainsGraph } from './graph-chains.ts'
import RadarValuesScreen from '../../src/RadarValues.tsx'
import { ForwardScreen } from '../../src/ForwardScreen.tsx'
import forwardLive from './forward-live-replies.json'
import { CrewsRulesSettings } from '../../src/CrewsRulesSettings.tsx'
import { emptyRepository, type RepositoryForm } from '../../src/settings-api.ts'
import WorkflowMap, { focusField } from '../../src/WorkflowMap.tsx'
import { toForm } from '../../src/settings-api.ts'
import AvoozlApp from '../../src/App.tsx'
import { MarkDoneDialog } from '../../src/TaskNotes.tsx'
import NewPlanDrawer from '../../src/NewPlanDrawer.tsx'
import { useTaskDrawer } from '../../src/drawer-context.ts'
import AvoozlPanel from '../../src/Panel.tsx'
import ModelsSettings from '../../src/ModelsSettings.tsx'

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

// A manual task waiting for a person, with links and notes (R61).
answer('task.detail', () => ({
  revision: 1,
  task: {
    id: 'team-review', title: 'Review with team', summary: 'The team reviews the results before cutover.',
    acceptance: ['The team agreed the runtime and protocol results are good enough to cut over'], checks: [],
    epic: null, epicTitle: null, phase: { id: 'review', title: 'Review' }, kind: 'leaf', authority: 'github', route: 'github',
    completion: 'person', repository: 'sdk', status: 'planned', state: 'needs-you', ready: false, needsReview: false, decision: null,
    owner: null, issue: { number: 47, url: 'https://github.example.test/o/sdk/issues/47', repository: 'o/sdk' }, wave: 5, context: '',
    manual: true, manualDone: null, onGitHub: true,
  },
  plan: null, locked: null, waitsOn: [], blocks: [], delivery: null, conflicts: [], timeline: [], timing: null,
}))
answer('task.notes.list', () => ({
  taskId: 'team-review',
  entries: [
    { id: 'note-000000000002', taskId: 'team-review', kind: 'link', label: 'Protocol test results', url: 'https://docs.example.test/results', outcome: false, author: 'session:chat-1', at: '2026-11-13T10:05:00Z', onIssue: false },
    { id: 'note-000000000001', taskId: 'team-review', kind: 'note', text: 'Agenda: runtime, protocol results, open gaps.\nInvite the runtime owners.', outcome: false, author: 'person', login: 'alice', at: '2026-11-13T09:00:00Z', onIssue: true },
  ],
}))
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
const repoEdit = (edited: boolean) =>
  shown((close) => (
    <RepositoryDialog name="avoozl" edited={edited} missing={null} saving={false} error={null} onSave={close} onDiscard={close}>
      <label className="flex flex-col gap-1 text-sm">
        Base branch
        <input defaultValue="main" className="rounded border px-2 py-1" />
      </label>
    </RepositoryDialog>
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
  projection: shown((close) => <ProjectionModal workspaceId="w" client={projections} planId="search-v2" title="Search v2" onClose={close} onCreated={() => undefined} />),
  'spec-changed': shown((close) => <SpecChangedModal workspaceId="w" client={projections} planId="search-v2" title="Search v2" onClose={close} onApplied={() => undefined} />),
  'task-drawer': own('Open the dialog', <OpenTask />),
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
  budget: null,
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
answer('instance.view', () => ({ id: 'inst-0123456789ab', name: 'Mira', others: query.get('shared') === '1' ? ['inst-aaaaaaaaaaaa'] : [], shared: query.get('shared') === '1' }))
answer('instance.rename', (body) => ({ id: 'inst-0123456789ab', name: String((body.input as { name?: string }).name), others: [], shared: false }))
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

function DeepLinkPage() {
  return (
    // As tall as the screen, so the page's content pane scrolls on its own, as it does in the host.
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, height: '100vh', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text)' }}>
      <AvoozlApp />
    </div>
  )
}

// ?page=home: the Dashboard alone with nothing in flight (?page=demo uses
// the same answers for the real workspace, before the sample opens). &ran=1 gives the
// workspace one finished task (it has run before); without it, none has.
if (query.get('page') === 'home' || query.get('page') === 'demo') {
  const ran = query.get('ran') === '1'
  const item = { id: 'a1', title: 'Task a1', complete: true, deliveries: [], sessions: [], evidence: [], integration: { commit: 'c', branch: 'main', at: '2026-11-13T10:00:00Z' }, pullRequests: [], issue: null, budget: null }
  answer('delivery.view', () => ({ revision: 1, items: ran ? [item] : [] }))
  answer('conflicts.view', () => ({ revision: 1, items: [] }))
  answer('plan.list', () => ({ items: [] }))
  // Home reads these too; an unanswered call never settles.
  answer('radar.crews', () => ({ readAt: null, stale: 0, errors: [], unseen: [], rows: [] }))
  answer('radar.releasequeue', () => ({ repositories: [] }))
}
// ?page=app: Settings reads the GitHub policy. &worker=1 leaves one
// repository on the retired Avoozl worker, which shows the Settings banner.
if (query.get('page') === 'app') {
  const worker = query.get('worker') === '1'
  // &needs=N: N open Needs you items, so the nav shows its count. Home's
  // other reads answer empty, so Home fills in.
  const needs = Number(query.get('needs') ?? 0)
  const item = (n: number) => ({ key: `k${n}`, kind: 'decision', taskId: `t${n}`, title: `Item ${n}`, detail: 'Waits on you.', plan: 'meal-planner', epic: null, repository: 'example/recipe-box', since: '2026-11-14T10:00:00Z' })
  answer('conflicts.view', () => ({ revision: 1, items: Array.from({ length: needs }, (_, n) => item(n + 1)) }))
  if (!replyFor('delivery.view')) answer('delivery.view', () => ({ revision: 1, items: [] }))
  if (!replyFor('plan.list')) answer('plan.list', () => ({ items: [] }))
  // &slowradar=1: Radar's crews read never answers, as a slow GitHub or
  // Kiro Crew would; Home must not wait on it.
  if (query.get('slowradar') === '1') answer('radar.crews', () => new Promise(() => undefined))
  else if (!replyFor('radar.crews')) answer('radar.crews', () => ({ readAt: null, stale: 0, errors: [], unseen: [], rows: [] }))
  if (!replyFor('radar.releasequeue')) answer('radar.releasequeue', () => ({ repositories: [] }))
  if (!replyFor('remote.view')) answer('remote.view', () => ({ workers: [] }))
  answer('github.settings.get', () => ({
    filename: '.avoozl.json',
    exists: true,
    hash: 'h',
    github: { mode: 'plans-repo', repositories: { 'acme/recipe-box': worker ? { coder: 'worker' } : { coder: 'issue-radar' } } },
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
      writes: { perMinute: 60, perHour: 400, run: { planId: 'nupp', done: 312, total: 1740, resumeAt: new Date(Date.now() + 38 * 60000).toISOString() } },
    },
    choices: { modes: ['local', 'plans-repo', 'single-repo'], authorities: [], coders: ['issue-radar', 'remote'], permissions: [], actions: [], fields: [], statusValues: [], managedLabels: [], crewLabels: [] },
  }))
}
// ?page=app&radar=1: the Dashboard has one live Issue Radar claim, and a
// Trace of it. The marker's own `updated=` (09:46) is ahead of GitHub's time
// for the claim comment (09:21); the Trace shows GitHub's.
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
  const step = (key: string, label: string, at: string | null, state: string, extra = {}) => ({ key, label, at, state, ...extra })
  answer('radar.trace', () => ({
    repository: 'acme/recipe-box',
    number: 52,
    title: 'Index builder',
    steps: [
      step('spec', 'Spec approved', '2026-11-09T08:02:00Z', 'done', { by: 'owner', detail: 'search · commit a41c9e2' }),
      step('issue', 'Issue created', '2026-11-09T08:10:00Z', 'done', { link: 'https://github.com/acme/recipe-box/issues/52' }),
      step('ready', 'Ready', '2026-11-09T09:15:00Z', 'done'),
      step('claimed', 'Claimed', '2026-11-09T09:21:00Z', 'done', { by: 'Draco' }),
      step('pr', 'PR opened', '2026-11-09T09:48:00Z', 'done', { link: 'https://github.com/acme/recipe-box/pull/57' }),
      query.get('merged')
        ? step('ci', 'CI', '2026-11-09T10:02:00Z', 'done', { detail: '6 checks passed', rounds: 1 })
        : step('ci', 'CI', null, 'now', { detail: '4 of 6 checks done', rounds: 2 }),
      query.get('merged')
        ? step('merged', 'Merged', '2026-11-09T10:12:00Z', 'done', { link: 'https://github.com/acme/recipe-box/pull/57', ...(query.get('receipt') ? { detail: '4 builds, 5 min in all · costliest test 3 min', builds: [{ phase: 'build', items: [{ target: 'linux-x64/node26', start: 'warm', attempt: 1, task: null, ms: 38000, failed: false }] }, { phase: 'test', items: [{ target: 'linux-x64/node26', start: 'warm', attempt: 1, task: null, ms: 120000, failed: true }, { target: 'linux-x64/node26', start: 'warm', attempt: 2, task: null, ms: 96000, failed: false }, { target: 'win32-x64/node26', start: 'cold', attempt: 1, task: null, ms: 174000, failed: false }] }] } : {}) })
        : step('merged', 'Merged', null, 'later'),
      step('retro', 'Retro', null, 'later', { detail: query.get('merged') ? 'Counted in the next retro' : 'After merge' }),
    ],
    crew: { id: 'c_022aea7f', name: 'Draco' },
    crewLastWordAt: '2026-11-09T10:09:00Z',
    links: { issue: 'https://github.com/acme/recipe-box/issues/52', pr: 'https://github.com/acme/recipe-box/pull/57', claim: null },
    problems: [],
  }))
}
// ?page=app&flow=1: Flow with one task at 80% of its budget, and Settings ›
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
    budget: { over: [], warning: ['search.3'], stopped: [], paused: [] },
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

// Settings pages with sample data (?page=budgets), for the
// settings screenshots. Only a settings
// page answers these, so the modal and app scenarios keep their own replies.
if (query.get('page') === 'budgets') {
answer('budget.settings.get', () => ({
  hash: 'h1',
  budget: { usd: 5, mode: 'stop' },
  repositories: { avoozl: { usd: 8, mode: 'warn' }, docs: {} },
}))
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
if (query.get('page') === 'github-flow' || (query.get('page') === 'app' && query.get('receipt')))
  answer('radar.flow', () => ({
    readAt: new Date(Date.now() - 4 * 60000).toISOString(),
    count: 2,
    issues: [],
    skipped: [{ number: 61 }],
    median: [15 * 60000, 45 * 60000, 35 * 60000, 10 * 60000],
    medianLead: 105 * 60000,
    efficiency: 90 / 210,
    bottleneck: 'Claim to PR',
    errors: [],
    repositories: ['acme/recipe-box'],
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
  answer('workspace.tick.health', () => ({ lastRun: null, lock: null }))
  answer('workspace.tick.log', () => ({ items: [] }))
}

// The app shell answers too, so Settings › Models can be shot in place.
if (query.get('page') === 'models' || query.get('page') === 'app') {
  let settings = { filename: '.avoozl.json', exists: true, hash: 'models-before', models: { planner: 'fake-writer' } }
  answer('GET /api/models', () => ['fake-writer', 'fake-reviewer'])
  answer('models.settings.get', () => settings)
  answer('models.settings.update', (body) => {
    state.calls.push(body)
    settings = { ...settings, hash: 'models-after', models: (body.input as { models: typeof settings.models }).models }
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

// ?page=activity: the Activity tab alone, with two rows.
if (query.get('page') === 'activity' || query.get('activity') === '1') {
  const row = (seq: number) => ({ seq, at: '2026-11-13T10:00:00Z', source: 'person', actor: 'me', kind: 'settings', summary: `Saved a setting ${seq}`, targetId: null, link: null, redacted: false })
  answer('activity.list', () => ({ items: [row(2), row(1)], total: 2, sources: ['person'], kinds: ['settings'], actors: ['me'], retentionDays: 30 }))
  answer('activity.settings.get', () => ({ hash: 'h', retentionDays: 30, default: 30 }))
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

// ?page=app&epics=empty|full and ?page=trace&done=empty|full: the Epics
// screen above the spec list, and Trace with no issue chosen (Done work).
const RADAR_GRAPH = { url: '/issue-radar', focus: false }
if (query.get('epics') === 'empty' || query.get('done') === 'empty') {
  answer('epics.view', () => ({ epics: [], unprojected: [], radarGraph: RADAR_GRAPH }))
  answer('trace.done', () => ({ rows: [] }))
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
if (query.get('done') === 'full') {
  const row = (taskId: string, title: string, issue: number, pr: number, mergedAt: string, name: string | null) => ({ taskId, title, repository: 'acme/recipe-box', issue, url: `https://github.com/acme/recipe-box/issues/${issue}`, pr, prUrl: `https://github.com/acme/recipe-box/pull/${pr}`, mergedAt, by: name ? { kind: 'radar-crew', id: 'c1', name } : null })
  answer('trace.done', () => ({ rows: [row('S4', 'Index builder', 52, 57, '2026-11-09T11:40:00Z', 'Draco'), row('S1', 'Tokenizer', 40, 41, '2026-11-08T10:00:00Z', null)] }))
}
function TraceDonePage() {
  const [picked, setPicked] = useState('')
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)' }}>
      <NavHistoryProvider>
        <TracePage workspaceId="w" target={null} onPick={(target) => setPicked(`${target.repository}#${target.number}`)} onOpenEpics={() => setPicked('epics')} />
        <p data-picked>{picked}</p>
      </NavHistoryProvider>
    </div>
  )
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
    queue: full ? [panelRow('S9', 'next', 'Waits on #52, then it is next.'), panelRow('S10', 'held', 'Held by the budget.')] : [],
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
  page === 'needs' ? <NeedsPage /> : page === 'specs' ? <SpecsPage /> : page === 'tip' ? <TipPage /> : page === 'trace' ? <TraceDonePage /> : page === 'panel' ? <PanelPage /> : page === 'workflow-map' ? <WorkflowMapPage /> : page === 'crews-rules' ? <CrewsRulesPage /> : page === 'tracker-gates' ? <TrackerGatesPage /> : page === 'radar-values' ? <RadarValuesPage /> : page === 'forward' ? <ForwardPage /> : intake ? <IntakePage /> : page === 'home' ? <HomePage /> : page === 'activity' ? <ActivityPage /> : page && page !== 'app' && page !== 'demo' ? <SettingsPage name={page} /> : query.get('app') ? <AppPage /> : <Page />,
)

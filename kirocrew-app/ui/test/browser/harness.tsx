// The modal harness page: one Avoozl modal at a time (?modal=<name>) on a
// page shaped like the host's. A fixed host header with a high z-index, a
// scroll pane with a transform (a containing block), a sticky column, the
// real Graph, and the modal's opener inside a card that is also a
// containing block. ?theme=light|dark sets the host theme attribute.
import { Component, useState, type ReactNode } from 'react'
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
import { ArchivePlanDialog, DeletePlanDialog } from '../../src/PlansView.tsx'
import { DocumentReader } from '../../src/DocumentReader.tsx'
import { StopLineButton } from '../../src/StopLine.tsx'
import { PackImportDialog } from '../../src/PackImport.tsx'
import { SendToRadar } from '../../src/SendToRadar.tsx'
import { SwitchModelButton } from '../../src/SwitchModel.tsx'
import ActivityView from '../../src/ActivityView.tsx'
import DashboardView, { InFlightRow } from '../../src/DashboardView.tsx'
import { setupForm } from '../../src/settings-api.ts'
import { LAYER } from '../../src/layers.ts'
import { CoderPicker } from '../../src/CoderPicker.tsx'
import ReleaseQueue from '../../src/ReleaseQueue.tsx'
import GithubFlow from '../../src/GithubFlow.tsx'
import { ReleaseModePicker } from '../../src/ReleaseMode.tsx'
import { ProjectionModal } from '../../src/ProjectionModal.tsx'
import { SpecChangedModal } from '../../src/SpecChangedModal.tsx'
import { projectionClient } from '../../src/projection-api.ts'
import { QuickGoalModal } from '../../src/QuickGoalModal.tsx'
import { quickGoalClient } from '../../src/quickgoal-api.ts'
import PluginsSettings from '../../src/PluginsSettings.tsx'
import SettingsView from '../../src/SettingsView.tsx'
import { answerIntake } from './intake-fixture.ts'
import RadarValuesScreen from '../../src/RadarValues.tsx'
import { CrewsRulesSettings } from '../../src/CrewsRulesSettings.tsx'
import { emptyRepository, type RepositoryForm } from '../../src/settings-api.ts'
import WorkflowMap, { focusField } from '../../src/WorkflowMap.tsx'
import { toForm } from '../../src/settings-api.ts'
import AvoozlApp from '../../src/App.tsx'
import { MarkDoneDialog } from '../../src/TaskNotes.tsx'
import NewPlanDrawer from '../../src/NewPlanDrawer.tsx'
import { useTaskDrawer } from '../../src/drawer-context.ts'
import AvoozlPanel from '../../src/Panel.tsx'

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

// Quick goal: sample replies. ?tasks=1 gives a one-task proposal, ?big=1 one
// that crosses a promote rule. Every call is recorded in __harness.calls.
const goalTask = (id: string, title: string) => ({ id, title, evidence: { file: 'package.json', line: 14 } })
const goalState = (status = 'proposed') => {
  const one = query.get('tasks') === '1'
  const tasks = one ? [goalTask('A', 'Cache dependencies in CI')] : [goalTask('A', 'Share one database fixture across files'), goalTask('B', 'Cache built fixtures'), goalTask('C', 'Run test files in parallel workers with a long title that wraps')]
  return {
    id: 'qg_aaaaaaaaaaaa', status, request: { goal: 'Make tests faster', repository: 'example/recipe-box', depth: 'look', budget: { turns: 20, minutes: 15 } },
    proposal: { tasks, edges: one ? [] : [{ from: 'A', to: 'B' }], batches: [], risks: one ? [] : ['C may expose tests that depend on order.'], questions: [], levels: one ? 1 : 2 },
    promote: query.get('big') === '1' ? ['public-interface'] : [],
    hint: one ? { text: 'This fits one pull request. A crew or your coder can take it without a plan.', action: 'Plan it anyway' } : null,
    plan: null, pull: status === 'approving' ? { number: 7, repository: 'example/recipe-box' } : null,
  }
}
answer('repositories.list', () => ({ items: [{ id: 'recipe', name: 'recipe', localCheckout: '/w/r', github: 'example/recipe-box', baseBranch: 'main' }] }))
answer('quickgoal.settings.get', () => ({ autoApprove: false }))
answer('quickgoal.list', () => [])
answer('quickgoal.propose', (body) => (state.calls.push(body), goalState()))
answer('quickgoal.confirm', (body) => {
  state.calls.push(body)
  const tasks = goalState().proposal.tasks
  return { id: 'qg_aaaaaaaaaaaa', spec: 'goal-make-tests-faster', repository: 'example/recipe-box', issues: tasks.map((t, i) => ({ id: `goal-make-tests-faster.${i + 1}`, title: t.title, requires: i === 1 ? ['goal-make-tests-faster.1'] : [] })) }
})
answer('quickgoal.approve', (body) => (state.calls.push(body), { ...goalState('approving'), pending: true }))
answer('quickgoal.promote', (body) => (state.calls.push(body), { ...goalState('promoted'), plan: { id: 'goal-make-tests-faster', hash: 'h', spec: 'goal-make-tests-faster' } }))
answer('quickgoal.discard', (body) => (state.calls.push(body), goalState('discarded')))
answer('quickgoal.edit', (body) => (state.calls.push(body), goalState()))
const quickGoals = quickGoalClient(useAppApi() as never)
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
  'switch-model': own('Switch model', <SwitchModelButton workspaceId="w" />),
  projection: shown((close) => <ProjectionModal workspaceId="w" client={projections} planId="search-v2" title="Search v2" onClose={close} onCreated={() => undefined} />),
  'spec-changed': shown((close) => <SpecChangedModal workspaceId="w" client={projections} planId="search-v2" title="Search v2" onClose={close} onApplied={() => undefined} />),
  'quick-goal': shown((close) => <QuickGoalModal workspaceId="w" client={quickGoals} onClose={close} />),
  'task-drawer': own('Open the dialog', <OpenTask />),
  'mark-done': shown((close) => <MarkDoneDialog workspaceId="w" taskId="team-review" title="Review with team" onIssue onClose={close} onDone={close} />),
  // The real page shows New spec over the whole page, not inside a card.
  'new-spec-template': shown((close) => createPortal(<div {...{ [APP_ATTR]: '' }}><NewPlanDrawer workspaceId="w" taken={[]} categories={[]} epics={[{ id: 'sdk-target', title: 'SDK target architecture' }]} start="template" onClose={close} /></div>, document.body)),
}

// The Switch model steps against fake answers: two running chats, one
// remote; the first Confirm finds the set changed (?changed=1).
if (query.get('modal') === 'switch-flow') {
  const chat = (slot: string, taskId: string, model: string, crew?: string) => ({ slot, taskId, title: `Task ${taskId}`, spec: 'spec-a', role: 'worker', model, to: 'gamma-1', where: crew ?? 'local' })
  answer('providers.view', () => ({
    settings: {},
    hash: null,
    defaults: { lowPercent: 80, cooldownMinutes: 30, windowHours: 5 },
    marks: [{ id: 'error:provider:beta', scope: 'provider', name: 'beta', level: 'out', source: 'error', kind: 'credits', since: '' }],
    switches: [],
    chats: [
      { slot: 's1', taskId: 'a1', role: 'worker', model: 'alpha-1', provider: 'alpha', level: 'ok' },
      { slot: 's2', taskId: 'a2', role: 'worker', model: 'alpha-1', provider: 'alpha', level: 'ok' },
    ],
  }))
  answer('GET /api/models', () => [{ model_id: 'gamma-1', display_name: 'Gamma one' }, { model_id: 'delta-1' }])
  let runs = 0
  const flow = state as unknown as { dryRuns: unknown[]; switches: unknown[] }
  flow.dryRuns = []
  flow.switches = []
  answer('provider.switch.dryRun', (body) => {
    flow.dryRuns.push(body.input)
    runs += 1
    const chats = [chat('s1', 'a1', 'alpha-1'), ...(runs > 1 && query.get('changed') ? [chat('s3', 'a3', 'alpha-1')] : [])]
    return {
      to: 'gamma-1',
      alsoNewTasks: true,
      chats,
      skipped: [{ ...chat('s2', 'a2', 'alpha-1', 'remote-1'), why: 'runs on remote crew remote-1: only chats on this machine switch' }],
      marks: [{ scope: 'provider', name: 'alpha', to: 'gamma-1' }],
      queued: [{ taskId: 'q1', title: 'Task q1', spec: 'spec-a', model: 'alpha-1' }],
      counts: { switch: chats.length, cannot: 1, queued: 1 },
      previewHash: `h${runs}`,
    }
  })
  answer('provider.switch', (body) => {
    const input = body.input as { previewHash: string }
    if (query.get('changed') && input.previewHash === 'h1') throw Object.assign(Error('The running chats changed since the dry run; check the new set.'), { status: 409 })
    flow.switches.push(input)
    return { queued: runs > 1 && query.get('changed') ? 2 : 1, marked: ['provider alpha'] }
  })
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
SCENARIOS['in-flight'] = { opener: '', render: () => <ul><InFlightRow row={flightRow as never} now={Date.now()} onInfo={() => undefined} /></ul> }
// Two rows with different roles, ids and actions: their columns must line up.
const reviewRow = { ...flightRow, slot: 's2', role: 'review:style', taskId: 'b22', title: 'A much longer task title for the second row', session: { ...flightRow.session, slot: 's2', role: 'review:style', link: '/chat?sid=s2' } }
SCENARIOS['in-flight-pair'] = { opener: '', render: () => <ul style={{ maxWidth: 900 }}><InFlightRow row={flightRow as never} now={Date.now()} onInfo={() => undefined} /><InFlightRow row={reviewRow as never} now={Date.now()} onInfo={() => undefined} onPickAgain={undefined} /></ul> }
SCENARIOS['switch-flow'] = own('Switch model', <SwitchModelButton workspaceId="w" />)

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

// ?page=app: the whole Avoozl page on one workspace with intake on and one
// open idea, for tests that move between tabs.
answer('workspaces.list', () => ({ defaultWorkspace: 'w', items: [{ id: 'w', name: 'Harness', root: '/w', enabled: true, state: 'ready', served: true }] }))
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
  ideas: [{ source: 'local', id: 'idea-1', kind: 'idea', title: 'Harness idea', state: 'open', author: 'me', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', notes: [], links: [], graduated: null }],
}))

function DeepLinkPage() {
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)' }}>
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
  answer('driversession.view', () => ({ state: 'none', slot: null, href: null, openedAt: null, lastSeenAt: null }))
}
// ?page=app: Settings reads the GitHub policy. &worker=1 leaves one
// repository on the retired Avoozl worker, which shows the Settings banner.
if (query.get('page') === 'app') {
  const worker = query.get('worker') === '1'
  answer('driversession.view', () => ({ state: 'none', slot: null, href: null, openedAt: null, lastSeenAt: null }))
  answer('github.settings.get', () => ({
    filename: '.avoozl.json',
    exists: true,
    hash: 'h',
    github: { mode: 'plans-repo', repositories: { 'acme/recipe-box': worker ? { coder: 'worker' } : { coder: 'issue-radar' } } },
    effective: null,
    error: null,
    crews: [],
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
  answer('flow.view', () => ({ line: [], stages: [], tasks: [], retros: [] }))
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
      step('ci', 'CI', null, 'now', { detail: '4 of 6 checks done', rounds: 2 }),
      step('merged', 'Merged', null, 'later'),
      step('retro', 'Retro', null, 'later', { detail: 'After merge' }),
    ],
    crew: { id: 'c_022aea7f', name: 'Draco' },
    crewLastWordAt: '2026-11-09T10:09:00Z',
    links: { issue: 'https://github.com/acme/recipe-box/issues/52', pr: 'https://github.com/acme/recipe-box/pull/57', claim: null },
    problems: [],
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
    ['rc-2.2', 'Write the preview', 'held', 'Waiting for a free slot (2 of 2 in use).', 'Phase 2'],
    ['rc-3.1', 'Verify an issue before a crew builds it', 'held', 'Waiting on rc-2.1, rc-2.2.', 'Phase 3'],
    ['rc-4.1', 'Release engine', 'held', 'Phase Phase 4 waits for phase p3 to merge (rc-3.1, rc-3.2, rc-3.3).', 'Phase 4'],
    ['rc-5.1', 'Merge path check', 'held', 'Step: waiting for a click to release phase Phase 5.', 'Phase 5'],
    ['rc-5.2', 'Arm GitHub auto-merge', 'held', 'The line is stopped: bad base on main.', 'Phase 5'],
  ].map(([taskId, title, state, reason, phase], i) => ({ taskId, title, planId: 'radar-coder', spec: 'radar-coder', phase, scope: null, label: 'ready', number: 10 + i, url: null, manual: false, state, reason, used: 2, capacity: 2 }))
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
if (query.get('page') === 'github-flow')
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
  }))
const PAGES: Record<string, () => ReactNode> = {
  'github-flow': () => <GithubFlow workspaceId="w" />,
  'release-queue': () => <ReleaseQueue workspaceId="w" />,
  'release-mode': () => <ReleaseModes />,
  'quick-goal': () => <QuickGoalModal workspaceId="w" client={quickGoals} onClose={() => undefined} />,
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
if (query.get('page') === 'activity') {
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
const intake = page === 'intake'
if (intake) answerIntake(query.get('empty') === '1')

// ?page=panel&sid=<chat>&state=full|empty: the side panel on sample reads.
// window.__panel holds what the reads return, so a test can change it and see
// the panel read again; window.__panelReads counts the reads and
// window.__panelCalls records writes.
type PanelData = { driver: unknown; conflicts: unknown[]; crews: unknown[]; remote: unknown[]; queue: unknown[]; tasks: unknown[]; line: unknown[]; specs: unknown[]; fail?: string }
const panelWin = window as unknown as { __panel: PanelData; __panelReads: number; __panelCalls: unknown[] }
const panelClaim = (number: number, crewId: string, crewName: string, phase: string, pr: number | null) => ({ repository: 'acme/recipe-box', number, title: number === 52 ? 'Index builder' : 'Ranking tests', url: `https://github.test/acme/recipe-box/issues/${number}`, crewId, crewName, phase, pr, prUrl: pr ? `https://github.test/acme/recipe-box/pull/${pr}` : null, updated: new Date(Date.now() - 600000).toISOString(), commentUrl: null, stale: false, noMarker: false })
const panelRow = (taskId: string, state: string, reason: string) => ({ taskId, title: `Task ${taskId}`, planId: 'search-v2', spec: 'search-v2', phase: 'one', scope: null, label: 'ready', number: null, url: null, manual: false, state, reason, used: 0, capacity: 2 })
if (page === 'panel') {
  const full = query.get('state') !== 'empty'
  panelWin.__panelReads = 0
  panelWin.__panelCalls = []
  panelWin.__panel = {
    driver: query.get('driver') === 'running' ? { state: 'running', slot: 'chat-7-1', href: '/chat?sid=chat-7-1', openedAt: new Date(Date.now() - 7200000).toISOString(), lastSeenAt: new Date(Date.now() - 300000).toISOString() } : query.get('driver') === 'idle' ? { state: 'idle', slot: 'chat-7-1', href: '/chat?sid=chat-7-1', openedAt: new Date(Date.now() - 86400000).toISOString(), lastSeenAt: new Date(Date.now() - 7200000).toISOString() } : query.get('driver') === 'unknown' ? null : { state: 'none', slot: null, href: null, openedAt: null, lastSeenAt: null },
    conflicts: full
      ? [
          { kind: 'needs-human', reason: 'crew', taskId: null, title: '#52 asks about the tokenizer', detail: 'Draco: tokenizer A or B? Crew paused with the needs-human label.', link: 'https://github.test/acme/recipe-box/issues/52' },
          { kind: 'github-conflict', taskId: 'S8', field: 'title', title: 'Ranking: acceptance edited', detail: 'Someone changed the title on GitHub.', choices: ['desired', 'github'] },
          { kind: 'stale-session', taskId: 'S9', title: 'A retired worker row', detail: 'must not show' },
        ]
      : [],
    crews: full ? [panelClaim(52, 'abc', 'Draco', 'CI', 57), panelClaim(58, 'def', 'Orla', 'working', null)] : [],
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
  answer('conflicts.view', () => ({ revision: 1, items: ((panelWin.__panelReads += 1), data().conflicts) }))
  answer('driversession.view', () => {
    if (!data().driver) throw new Refusal(500, { error: 'down' })
    return data().driver
  })
  answer('radar.crews', () => ({ readAt: null, stale: 0, errors: [], unseen: [], rows: data().crews }))
  answer('remote.view', () => ({ workers: data().remote }))
  answer('radar.releasequeue', () => ({ repositories: [{ repository: 'acme/recipe-box', ready: 'ready', mode: 'automatic', capacity: 2, scopes: [], steps: [], rows: data().queue }] }))
  answer('flow.view', () => ({ tasks: data().tasks, line: data().line, stops: data().line }))
  answer('plan.specs', () => ({ root: '/w', items: data().specs }))
  answer('github.conflict.resolve', (body) => (panelWin.__panelCalls.push(body.input), {}))
  answer('GET /api/apps/spec-builder/specs', () => ({ specs: [{ name: 'search-v2' }] }))
}
// ?page=panel&real=1: the panel on the replies a real backend gave over the
// sample workspace (window.__REAL_PANEL, panel-real.test.mjs), so a reply that
// drifts from what the panel reads shows up here and not only in a live host.
const realPanel = (window as unknown as { __REAL_PANEL?: Record<string, unknown> }).__REAL_PANEL
if (page === 'panel' && query.get('real') === '1' && realPanel) {
  for (const name of ['conflicts.view', 'radar.crews', 'remote.view', 'radar.releasequeue', 'flow.view', 'plan.specs', 'driversession.view'])
    answer(name, () => realPanel[name])
  answer('GET /api/apps/spec-builder/specs', () => ({ specs: ((realPanel['plan.specs'] as { items: { name: string }[] }).items ?? []).map((item) => ({ name: item.name })) }))
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
    <div style={{ width: 360, padding: 0, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <HarnessBoundary>
        <AvoozlPanel />
      </HarnessBoundary>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(
  page === 'tip' ? <TipPage /> : page === 'trace' ? <TraceDonePage /> : page === 'panel' ? <PanelPage /> : page === 'workflow-map' ? <WorkflowMapPage /> : page === 'crews-rules' ? <CrewsRulesPage /> : page === 'radar-values' ? <RadarValuesPage /> : intake ? <IntakePage /> : page === 'home' ? <HomePage /> : page === 'activity' ? <ActivityPage /> : page && page !== 'app' && page !== 'demo' ? <SettingsPage name={page} /> : query.get('app') ? <AppPage /> : <Page />,
)

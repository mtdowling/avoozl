// The modal harness page: one Avoozl modal at a time (?modal=<name>) on a
// page shaped like the host's. A fixed host header with a high z-index, a
// scroll pane with a transform (a containing block), a sticky column, the
// real Graph, and the modal's opener inside a card that is also a
// containing block. ?theme=light|dark sets the host theme attribute.
import { Component, useState, type ReactNode } from 'react'
import { FilterPanel } from '../../src/FilterPanel.tsx'
import ConflictsView from '../../src/ConflictsView.tsx'
import { IconBtn } from '../../src/ui/controls.tsx'
import { RefreshCw } from '../../src/icons.ts'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { answer, Btn, Card, Refusal, replyFor, useAppApi } from './stubs.tsx'
import { NavHistoryProvider, APP_ATTR } from '../../src/NavHistory.tsx'
import { SpecLinkContext } from '../../src/spec-link.ts'
import { ConfirmProvider, DangerBtn, InfoTip } from '../../src/ui/controls.tsx'
import { Tooltip } from '../../src/ui/Tooltip.tsx'
import { TaskDrawerProvider } from '../../src/TaskDrawer.tsx'
import GraphView from '../../src/GraphView.tsx'
import AddPlugin from '../../src/AddPlugin.tsx'
import SetupRepository from '../../src/Onboard.tsx'
import { Modal } from '../../src/ui/Modal.tsx'
import { specGraph } from './spec-graph-fixture.ts'
import { installInlineFixture } from './settings-inline-fixture.ts'
import { SetupDialog } from '../../src/SetupWizard.tsx'
import PlansView, { ArchivePlanDialog, DeletePlanDialog } from '../../src/PlansView.tsx'
import { DocumentReader } from '../../src/DocumentReader.tsx'
import { StopLineButton } from '../../src/StopLine.tsx'
import WorkspaceView from '../../src/WorkspaceView.tsx'
import { PackImportDialog } from '../../src/PackImport.tsx'
import ActivityView from '../../src/ActivityView.tsx'
import DashboardView, { InFlightRow } from '../../src/DashboardView.tsx'
import { setupForm } from '../../src/settings-api.ts'
import { LAYER } from '../../src/layers.ts'
import FlowBuilds from '../../src/FlowBuilds.tsx'
import PluginsSettings from '../../src/PluginsSettings.tsx'
import SettingsView, { RateBlock, RepositoryEditor } from '../../src/SettingsView.tsx'
import type { EditTab } from '../../src/repo-edit-tabs.ts'
import { answerIntake, PLUGINS } from './intake-fixture.ts'
import { chainsGraph, draftsGraph } from './graph-chains.ts'
import { landingFixture } from './landing-fixture.ts'
import { detailFor, listFor, triageView } from './triage-fixture.ts'
import { ForwardScreen } from '../../src/ForwardScreen.tsx'
import forwardLive from './forward-live-replies.json'
import { AutoMergeFields, ConflictFields, MergeMethodFields } from '../../src/LandingFields.tsx'
import { emptyRepository, type RepositoryForm } from '../../src/settings-api.ts'
import WorkflowMap, { focusField } from '../../src/WorkflowMap.tsx'
import { toForm } from '../../src/settings-api.ts'
import AvoozlApp from '../../src/App.tsx'
import { MarkDoneDialog } from '../../src/TaskNotes.tsx'
import { reviewFixture } from './review-fixture.ts'
import { needsContextItems } from './needs-context-fixture.ts'
import NewPlanDrawer from '../../src/NewPlanDrawer.tsx'
import NewFixDrawer from '../../src/NewFixDrawer.tsx'
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

const row = {
  key: 'p1',
  kind: 'spec',
  name: 'Modal plan',
  spec: 'modal-plan',
  folder: '.kiro/specs/modal-plan',
  planId: 'modal-plan',
  type: 'feature',
  category: null,
  categoryProblem: null,
  errors: 0,
  status: 'approved',
  tasks: { total: 3, done: 1 },
  now: { ready: 1, running: 0, needsYou: 0 },
  epics: 1,
  lastChange: null,
}
const text = ['# Guide', '', 'A short file for the viewer.', '', '## Part one', '', 'Some words.', '', '## Part two', '', 'More words.'].join('\n')

// A manual task waiting for a person, with links (R61).
// The AI summary (?summary=none|working|ready|failed): what task.detail
// carries, and what task.summary.request answers. A request for a summary that
// is not written yet answers working, then ready on the next one.
const SUMMARY_TEXT =
  'Team review is the last gate before cutover. It is waiting on you: the protocol tests passed, and nothing else blocks it. Cutover starts once you mark it done.'
const summaryAt = (name: string) => ({
  state: name,
  text: name === 'ready' ? SUMMARY_TEXT : null,
  hash: 'h1',
  ...(name === 'failed' ? { reason: 'The summary chat ended without sending a summary.' } : {}),
})
let summaryAsks = 0
answer('task.summary.request', (body) => {
  state.calls.push(body)
  summaryAsks++
  if ((body.input as { retry?: boolean }).retry) return summaryAt('working')
  return summaryAt(query.get('summary') === 'failed' || summaryAsks < 2 ? 'working' : 'ready')
})
// The spec file the task came from: 40 lines, the task's own at 20–21.
const SPEC_LINES = Array.from({ length: 40 }, (_, i) => `Spec line ${i + 1}`)
answer('document.get', () => ({ id: '.kiro/specs/team/tasks.md', title: 'tasks.md', text: SPEC_LINES.join('\n') }))
const baseDetail = () => ({
  origin: {
    kind: 'spec',
    label: 'Spec task',
    text: 'From .kiro/specs/team/tasks.md, lines 20–21.',
    spec: null,
    plan: null,
    sources: [{ document: '.kiro/specs/team/tasks.md', title: null, lineStart: 20, lineEnd: 21, checked: null, readable: true }],
  },
  summary: summaryAt(query.get('summary') ?? 'none'),
  revision: 1,
  task: {
    id: 'team-review',
    title: 'Review with team',
    summary: 'The team reviews the results before cutover.',
    acceptance: ['The team agreed the runtime and protocol results are good enough to cut over'],
    checks: ['npm run test:protocol'],
    epic: null,
    epicTitle: null,
    phase: { id: 'review', title: 'Review' },
    kind: 'leaf',
    authority: 'github',
    route: 'github',
    completion: 'person',
    repository: 'sdk',
    status: 'planned',
    state: 'needs-you',
    ready: false,
    needsReview: false,
    decision: null,
    owner: null,
    issue: { number: 47, url: 'https://github.example.test/o/sdk/issues/47', repository: 'o/sdk' },
    wave: 5,
    context: '',
    manual: true,
    manualDone: null,
  },
  // ?plan=spec: the task an approved spec made, whose text is the spec's.
  ...(query.get('plan') === 'spec'
    ? {
        plan: { id: 'team', title: 'Team rollout', spec: 'team', state: 'approved', approved: true },
        locked: { reason: 'approved-spec', message: 'This task comes from the approved spec Team rollout.' },
      }
    : { plan: null, locked: null }),
  waitsOn: [{ id: 'protocol-tests', title: 'Protocol tests', kind: 'requires', condition: null, satisfied: true }],
  blocks: [{ id: 'cutover', title: 'Cutover', kind: 'requires', condition: null, satisfied: false }],
  delivery: null,
  conflicts: [],
  timeline: [
    { at: '2026-11-13T10:05:00Z', text: 'Waiting for a person: Review with team' },
    { at: '2026-11-13T09:00:00Z', text: 'Protocol tests finished' },
  ],
  timing: null,
  // Its stored link set (R92.5): checks read for an older head show stale.
  links: {
    task: 'team-review',
    repository: 'o/sdk',
    branch: { kind: 'branch', repository: 'o/sdk', ref: 'avoozl/team-review', url: 'https://github.com/o/sdk/tree/avoozl/team-review' },
    worktree: { kind: 'worktree', path: '/w/avoozl-worktrees/team-review', local: true },
    head: 'b'.repeat(40),
    pr: { kind: 'pull', repository: 'o/sdk', number: 52, url: 'https://github.com/o/sdk/pull/52', state: 'open' },
    checks: {
      state: 'pass',
      head: 'a'.repeat(40),
      readAt: '2026-11-13T09:30:00Z',
      ageMs: 1800000,
      current: false,
      dot: 'stale',
      source: 'pull-request',
      url: 'https://github.com/o/sdk/pull/52/checks',
    },
    landed: null,
    issue: { kind: 'issue', repository: 'o/sdk', number: 47, url: 'https://github.com/o/sdk/issues/47' },
    source: null,
  },
  steps: [
    { key: 'spec', label: 'Spec approved', at: '2026-11-13T08:00:00Z', state: 'done', by: 'owner' },
    { key: 'ready', label: 'Ready', at: null, state: 'skipped' },
    { key: 'started-1', label: 'Started (attempt 1)', at: '2026-11-13T08:10:00Z', state: 'done', by: 'model-a', detail: 'worker' },
    { key: 'failed-1', label: 'Attempt 1 failed', at: '2026-11-13T08:40:00Z', state: 'done', failed: true, detail: 'tests red' },
    { key: 'started-2', label: 'Started (attempt 2)', at: '2026-11-13T09:00:00Z', state: 'done', detail: 'worker' },
    { key: 'checks', label: 'Checks', at: '2026-11-13T09:30:00Z', state: 'done', detail: '2 passed' },
    { key: 'landed', label: 'Landed', at: '2026-11-13T09:35:00Z', state: 'done', detail: 'Commit 0123456789ab' },
    {
      key: 'builds',
      label: 'Builds',
      at: '2026-11-13T09:32:00Z',
      state: 'done',
      detail: '2 builds, 2 min in all · costliest test 1.5 min',
      builds: [
        { phase: 'build', items: [{ target: 'linux-x64/node26', start: 'warm', attempt: 1, task: 'team-review', ms: 38000, failed: false }] },
        { phase: 'test', items: [{ target: 'linux-x64/node26', start: 'warm', attempt: 1, task: 'team-review', ms: 90000, failed: true }] },
      ],
    },
    { key: 'integrated', label: 'Integrated', at: null, state: 'now' },
  ],
})
answer('task.detail', () => baseDetail())
answer('task.evidence', () => ({
  taskId: 'team-review',
  entries: query.get('evidence') === 'none' ? [] : [{ id: 'ev-1', kind: 'check', at: '2026-11-13T09:00:00Z', source: 'session:chat-1', text: 'npm run test:protocol passed' }],
}))
answer('task.notes.list', () => ({
  taskId: 'team-review',
  entries: [
    {
      id: 'note-000000000002',
      taskId: 'team-review',
      kind: 'link',
      label: 'Protocol test results',
      url: 'https://docs.example.test/results',
      outcome: false,
      author: 'session:chat-1',
      at: '2026-11-13T10:05:00Z',
      onIssue: false,
    },
    {
      id: 'note-000000000001',
      taskId: 'team-review',
      kind: 'link',
      label: 'Review agenda',
      url: 'https://docs.example.test/agenda',
      outcome: false,
      author: 'person',
      login: 'alice',
      at: '2026-11-13T09:00:00Z',
      onIssue: true,
    },
  ],
}))
answer('task.notes.add', (body) => {
  state.calls.push(body)
  const input = body.input as { taskId: string; url: string; label: string }
  return {
    id: 'note-000000000003',
    taskId: input.taskId,
    kind: 'link',
    url: input.url,
    label: input.label,
    outcome: false,
    author: 'person',
    at: '2026-11-13T11:00:00Z',
    onIssue: false,
  }
})
answer('repositories.list', () => ({ items: [{ id: 'sdk', name: 'sdk', localCheckout: '/w/sdk', github: 'o/sdk', baseBranch: 'main' }] }))
answer('template.list', () => ({
  templates: [
    {
      plugin: 'sdk-templates',
      version: '1.0.0',
      id: 'sdk-rewrite',
      title: 'SDK rewrite',
      description: 'Rewrite one SDK on the new runtime, phase by phase, with a team review before cutover.',
      inputs: [
        { id: 'sdk', label: 'Which SDK', type: 'text', required: true },
        { id: 'repository', label: 'Target repository', type: 'repositories', required: true },
        { id: 'gaps', label: 'Gap list', type: 'file', required: false },
      ],
      phases: ['Inventory', 'Codegen', 'Runtime', 'Protocol tests', 'Review', 'Cutover'].map((title) => ({ id: title.toLowerCase(), title })),
      proofKinds: ['Protocol tests pass', 'Cutover dry run'],
      settings: true,
    },
  ],
}))
answer('plugin.pack.preview', () => ({
  id: 'sdk-templates',
  version: '1.0.0',
  description: 'SDK rewrite settings',
  repositories: [],
  warnings: [],
  previewHash: 'h',
  imported: null,
  changes: [
    { setting: 'flow.retro', action: 'create', to: { everyTasks: 10 } },
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
  const group = {
    key: 'g1',
    kind: 'review',
    taskId: null,
    title: 'Meal planner: sections changed',
    detail: 'Two tasks changed.',
    plan: 'meal-planner',
    epic: null,
    repository: null,
    since: '2026-11-14T10:00:00Z',
    tasks: [
      { id: 'team-review', title: 'Review with team', status: 'planned' },
      { id: 'cutover', title: 'Cutover', status: 'planned' },
    ],
  }
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
    <Modal
      id="avoozl-repo-edit"
      dismissLabel="Cancel"
      width="46rem"
      title="avoozl"
      unsaved={edited && { title: 'Discard your changes to avoozl?', body: 'Every edit in this dialog is lost.', action: 'Discard changes' }}
      onDismiss={close}
    >
      <label className="flex flex-col gap-1 text-sm">
        Base branch
        <input defaultValue="main" className="rounded border px-2 py-1" />
      </label>
    </Modal>
  ))

export const SCENARIOS: Record<string, Scenario> = {
  'add-plugin': own('Add plugin', <AddPlugin workspaceId="w" client={idle} supported={[1]} onChanged={async () => undefined} />),
  onboard: shown((close) => <SetupRepository workspaceId="w" folder="/work/avoozl" onChanged={async () => undefined} onClose={close} />),
  'repo-edit': repoEdit(false),
  'repo-edit-unsaved': repoEdit(true),
  'setup-github': shown((close) => (
    <SetupDialog workspaceId="w" client={idle} form={setupForm({})} set={() => undefined} first={null} onClose={close} onSaved={async () => undefined} />
  )),
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
  'pack-import': shown((close) => (
    <PackImportDialog row={{ id: 'pack-1', version: '1.0.0' } as never} workspaceId="w" client={idle} onClose={close} onChanged={async () => undefined} />
  )),
  // Not a modal: the drawer's Files fold, at a drawer's width.
  'task-files': shown(() => (
    <div style={{ maxWidth: 620 }}>
      <TaskFiles workspaceId="w" taskId="a1" active />
    </div>
  )),
  'task-drawer': own('Open the dialog', <OpenTask />),
  'review-info': own('Open the dialog', <OpenReview />),
  'mark-done': shown((close) => <MarkDoneDialog workspaceId="w" taskId="team-review" title="Review with team" onClose={close} onDone={close} />),
  // The real page shows New spec over the whole page, not inside a card.
  // New spec with nothing picked: categories and epics to choose from.
  'new-spec': shown((close) =>
    createPortal(
      <div {...{ [APP_ATTR]: '' }}>
        <NewPlanDrawer workspaceId="w" taken={[]} categories={['Platform', 'Search']} epics={[{ id: 'sdk-target', title: 'SDK target architecture' }]} onClose={close} />
      </div>,
      document.body,
    ),
  ),
  // New fix beside New spec (triage-agent TA9.2).
  'new-fix': shown((close) =>
    createPortal(
      <div {...{ [APP_ATTR]: '' }}>
        <NewFixDrawer workspaceId="w" onClose={close} />
      </div>,
      document.body,
    ),
  ),
  'new-spec-template': shown((close) =>
    createPortal(
      <div {...{ [APP_ATTR]: '' }}>
        <NewPlanDrawer workspaceId="w" taken={[]} categories={[]} epics={[{ id: 'sdk-target', title: 'SDK target architecture' }]} start="template" onClose={close} />
      </div>,
      document.body,
    ),
  ),
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
  const opts = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ]
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
        <span role="status" className="text-xs text-muted">
          4 of 4
        </span>
        <IconBtn icon={RefreshCw} label="Refresh" tooltip="Refresh" onClick={() => undefined} />
      </FilterPanel>
    </div>
  )
}
SCENARIOS['filter-row'] = { opener: '', render: () => <FilterRowDemo /> }
SCENARIOS['in-flight'] = {
  opener: '',
  render: () => (
    <ul>
      <InFlightRow row={flightRow as never} now={Date.now()} onInfo={() => undefined} />
    </ul>
  ),
}
// Two rows with different roles, ids and actions: their columns must line up.
const reviewRow = {
  ...flightRow,
  slot: 's2',
  role: 'review:style',
  taskId: 'b22',
  title: 'A much longer task title for the second row',
  session: { ...flightRow.session, slot: 's2', role: 'review:style', link: '/chat?sid=s2' },
}
SCENARIOS['in-flight-pair'] = {
  opener: '',
  render: () => (
    <ul style={{ maxWidth: 900 }}>
      <InFlightRow row={flightRow as never} now={Date.now()} onInfo={() => undefined} />
      <InFlightRow row={reviewRow as never} now={Date.now()} onInfo={() => undefined} onPickAgain={undefined} />
    </ul>
  ),
}

// The whole page's top row (?app=1): workspaces and the line, nothing else
// answered, so each tab stays on its loading line. ?stopped=1 opens a stop.
if (query.get('app')) {
  answer('workspaces.list', () => ({ defaultWorkspace: 'w', items: [{ id: 'w', name: 'Workspace', served: true }] }))
  answer('flow.view', () => ({ line: query.get('stopped') ? [{ id: 'l1', manual: true, reason: 'bad base', scope: 'all', closedAt: null, branch: 'main', check: null }] : [] }))
}

// The Files fold's reads: a worktree with each kind of change.
const change = (path: string, status: string, additions: number | null, deletions: number | null, extra = {}) => ({
  path,
  from: null,
  status,
  additions,
  deletions,
  binary: false,
  ...extra,
})
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
  all: (body.input as { all?: boolean })?.all
    ? { paths: ['README.md', 'package.json', 'src/app/store.mjs', 'src/app/operations.mjs', 'src/app/task-files.mjs', 'src/app/renamed.mjs'], truncated: false }
    : null,
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
answer('instance.view', () => ({
  id: 'inst-0123456789ab',
  name: instanceName,
  others: query.get('shared') === '1' ? ['inst-aaaaaaaaaaaa'] : [],
  shared: query.get('shared') === '1',
}))
answer('instance.rename', (body) => ({ id: 'inst-0123456789ab', name: (instanceName = String((body.input as { name?: string }).name)), others: [], shared: false }))

// &graph=chains: the Graph on three specs with real chains (graph-chains.ts).
if (query.get('graph') === 'chains') answer('graph.view', () => chainsGraph)
// &graph=drafts: the same, plus one draft spec's tasks (graph-chains.ts).
if (query.get('graph') === 'drafts') answer('graph.view', () => draftsGraph)

// GitHub › Issues, Pull requests and Triage agent (triage-agent-shots.mjs):
// &agent=1 fills them; without it every list is empty.
answer('items.list', (body) => {
  const input = (body.input ?? {}) as { kind?: string; owner?: boolean }
  return query.get('agent') === '1' ? listFor(input) : { kind: input.kind ?? 'issue', total: 0, items: [], labels: [], repositories: [], ownerQueue: 0 }
})
answer('items.detail', (body) => detailFor((body.input ?? {}) as { number?: number }))
answer('triage.view', () => (query.get('agent') === '1' ? triageView : { ...triageView, repositories: [], inProgress: [], runs: [], days: [], ownerQueue: 0 }))
answer('fix.start', () => ({ taskId: 'fix-1' }))

// Dashboards › Landing queue: empty by default; &landing=1 has two bases
// with every hold reason (landing-queue-shots.mjs).
answer('landing.queue', () => (query.get('landing') === '1' ? landingFixture : { bases: [], readAt: '2026-11-17T12:00:00Z' }))

function DeepLinkPage() {
  return (
    // As tall as the screen with no frame around it, so the nav reaches the window's bottom and the page's content pane scrolls on its own, as in the host.
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 0, height: '100vh', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text)' }}>
      <AvoozlApp />
    </div>
  )
}

// ?page=home: the Dashboard alone with nothing in flight (?page=demo uses
// the same answers for the real workspace, before the sample opens). &ran=1 gives the
// workspace one finished task (it has run before); without it, none has.
if (query.get('page') === 'home' || query.get('page') === 'demo') {
  const ran = query.get('ran') === '1'
  const item = {
    id: 'a1',
    title: 'Task a1',
    complete: true,
    deliveries: [],
    sessions: [],
    evidence: [],
    integration: { commit: 'c', branch: 'main', at: '2026-11-13T10:00:00Z' },
    pullRequests: [],
    issue: null,
  }
  answer('delivery.view', () => ({ revision: 1, items: ran ? [item] : [] }))
  answer('conflicts.view', () => ({ revision: 1, items: [] }))
  answer('plan.list', () => ({ items: [] }))
  // Home reads these too; an unanswered call never settles.
  answer('radar.releasequeue', () => ({ repositories: [] }))
  answer('landing.view', () => ({ queue: [], landed: [], landedThisWeek: 0 }))
}
// ?page=app: Settings reads the GitHub policy. &worker=1 leaves one
// repository on the local Avoozl worker.
if (query.get('page') === 'app') {
  const worker = query.get('worker') === '1'
  // &needs=N: N open Needs you items, so the nav shows its count. Home's
  // other reads answer empty, so Home fills in.
  const needs = Number(query.get('needs') ?? 0)
  const item = (n: number) => ({
    key: `k${n}`,
    kind: 'decision',
    taskId: `t${n}`,
    title: `Item ${n}`,
    detail: 'Waits on you.',
    plan: 'meal-planner',
    epic: null,
    repository: 'example/recipe-box',
    since: '2026-11-14T10:00:00Z',
  })
  // &reviewgroup=1: one review group (two tasks changed in a spec) in Needs you.
  const reviewGroup = {
    key: 'g1',
    kind: 'review',
    reason: 'review',
    taskId: null,
    title: 'Meal planner: sections changed',
    detail: 'Two tasks changed.',
    plan: 'meal-planner',
    epic: null,
    repository: null,
    since: '2026-11-14T10:00:00Z',
    tasks: [
      { id: 'team-review', title: 'Review with team', status: 'planned' },
      { id: 'cutover', title: 'Cutover', status: 'planned' },
    ],
  }
  answer('conflicts.view', () => ({ revision: 1, items: [...Array.from({ length: needs }, (_, n) => item(n + 1)), ...(query.get('reviewgroup') === '1' ? [reviewGroup] : [])] }))
  // &needsctx=1: Needs you items that carry their context (needs-context-fixture.ts).
  if (query.get('needsctx') === '1') answer('conflicts.view', () => ({ revision: 1, items: needsContextItems }))
  if (!replyFor('delivery.view')) answer('delivery.view', () => ({ revision: 1, items: [] }))
  if (!replyFor('plan.list')) answer('plan.list', () => ({ items: [] }))
  if (!replyFor('radar.releasequeue')) answer('radar.releasequeue', () => ({ repositories: [] }))
  if (!replyFor('remote.view')) answer('remote.view', () => ({ workers: [] }))
  if (!replyFor('landing.view')) answer('landing.view', () => ({ queue: [], landed: [], landedThisWeek: 0 }))
  // &home=empty: Home's CI read answers with no runs (only Home reads it).
  if (query.get('home') === 'empty') answer('flow.view', () => ({ line: [], stages: [], tasks: [], retros: [], flaky: [], ciOnly: [], ci: { repositories: [] } }))
  // &roles=plans|single|local: Repository setup with a role on each row
  // (R105), the planning repository without a checkout in &roles=plans.
  const roles = query.get('roles')
  const rolesGithub =
    roles === 'single'
      ? { mode: 'single-repo', repositories: { 'acme/recipe-box': { baseBranch: 'main', role: 'both' }, 'acme/recipe-api': { baseBranch: 'main', role: 'both' } } }
      : roles === 'local'
        ? { repositories: { 'acme/recipe-box': { baseBranch: 'main', role: 'local' }, 'acme/recipe-api': { baseBranch: 'main', role: 'local' } } }
        : {
            mode: 'plans-repo',
            planningRepository: 'acme/plans',
            epicIssueType: 'Epic',
            repositories: {
              'acme/recipe-box': {
                baseBranch: 'main',
                role: 'code',
                requiredChecks: ['test (ubuntu)', 'test (macos)', 'test (windows)'],
                landing: { method: 'squash' },
              },
              'acme/recipe-api': { baseBranch: 'main', role: 'code', minimumPermission: 'write' },
            },
          }
  if (roles)
    answer('repositories.list', () => ({
      items: [
        { id: 'recipe-box', name: 'recipe-box', localCheckout: '/src/recipe-box', github: 'acme/recipe-box', baseBranch: 'main', landing: 'pr', harness: 'kiro' },
        { id: 'recipe-api', name: 'recipe-api', localCheckout: '/src/recipe-api', github: 'acme/recipe-api', baseBranch: 'main', landing: 'direct' },
        { id: 'notes', name: 'notes', localCheckout: '/src/notes', github: null, baseBranch: 'main' },
      ],
    }))
  // Add repository and Set up GitHub and import specs read a folder the same way.
  if (roles) {
    // Save writes are recorded in __harness.calls.
    if (!replyFor('github.settings.update'))
      answer('github.settings.update', (body) => {
        state.calls.push(body)
        return replyFor('github.settings.get')!({})
      })
    // A folder named like a plans repository looks like one; the rest look
    // like code in this plans-repo workspace.
    answer('repositories.detect', (body) => {
      const folder = (body.input as { folder: string }).folder
      const plans = /plans/.test(folder)
      return {
        root: folder.replace(/^~/, '/home-folder'),
        id: plans ? 'team-plans' : 'new-service',
        baseBranch: 'main',
        remote: 'origin',
        github: plans ? 'acme/team-plans' : 'acme/new-service',
        kind: plans
          ? { role: 'planning', source: '', reasons: ['It has spec folders in .kiro/specs and no code.'], upstream: null, code: null, specs: 2, visibility: 'private' }
          : {
              role: 'code',
              source: '',
              reasons: ["acme/plans is this workspace's planning repository, so its issues live there.", 'It has code (package.json).'],
              upstream: null,
              code: 'package.json',
              specs: 0,
              visibility: 'public',
            },
      }
    })
    answer('repositories.configure', (body) => ({
      id: (body.input as { id: string }).id,
      name: (body.input as { id: string }).id,
      localCheckout: (body.input as { localCheckout: string }).localCheckout,
      github: 'acme/new-service',
      baseBranch: 'main',
    }))
    answer('onboarding.inspect', (body) => ({
      root: (body.input as { folder: string }).folder,
      baseBranch: 'main',
      currentBranch: 'main',
      remote: 'git@github.com:acme/new-service.git',
      github: 'acme/new-service',
      id: 'new-service',
      settingsFile: false,
      specs: ['search-v2'],
      registered: { id: 'new-service', localCheckout: (body.input as { folder: string }).folder, github: 'acme/new-service', baseBranch: 'main', planning: false },
      visibility: 'private',
      githubError: null,
    }))
  }
  answer('github.settings.get', () => ({
    filename: '.avoozl.json',
    exists: true,
    hash: 'h',
    github: roles ? rolesGithub : { mode: 'plans-repo', repositories: { 'acme/recipe-box': {} } },
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
      bySource: {
        tick: { calls: 88, notModified: 40, cached: 0 },
        crew: { calls: 41, notModified: 0, cached: 0 },
        view: { calls: 17, notModified: 21, cached: 132 },
        review: { calls: 5, notModified: 0, cached: 3 },
        setup: { calls: 2, notModified: 0, cached: 0 },
      },
      writes: { perMinute: 60, perHour: 400, run: { planId: 'nupp', done: 312, total: 1740, resumeAt: new Date(Date.now() + 38 * 60000).toISOString() } },
    },
    choices: { modes: ['local', 'plans-repo', 'single-repo'], authorities: [], permissions: [], actions: [], fields: [], statusValues: [] },
  }))
  // &ghfull=1: the same settings with the last hour's GitHub calls by
  // source, so Settings › GitHub shows every section.
  if (query.get('ghfull') === '1') {
    const base = replyFor('github.settings.get')!({}) as Record<string, unknown>
    answer('github.settings.get', () => ({
      ...base,
      rate: {
        ...(base.rate as object),
        resources: { core: { limit: 5000, remaining: 1078, resetAt: new Date(Date.now() + 22 * 60000).toISOString() } },
        calls: 214,
        notModified: 61,
        notModifiedShare: 61 / 214,
        hourCalls: 153,
        bySource: {
          tick: { calls: 88, notModified: 40, cached: 0 },
          view: { calls: 17, notModified: 21, cached: 132 },
          review: { calls: 5, notModified: 0, cached: 3 },
          setup: { calls: 2, notModified: 0, cached: 0 },
        },
      },
    }))
  }
}
// ?page=app&home=1: a busy Home (home shots): tasks in
// every state, four Needs you items, two chats (one quiet), a landing
// queue with a held portion, landings this week and CI facts. Times are
// relative to now so the quiet chat and this week's landings stay true.
if (query.get('page') === 'app' && query.get('home') === '1') {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()
  const t = (id: string, title: string, epic: string, extra = {}) => ({
    ...task(id, epic),
    title,
    planId: epic === 'e1' ? 'meal-planner' : 'search-v2',
    repository: 'recipe-box',
    phase: null,
    ...extra,
  })
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
  answer('plan.list', () => ({
    total: 2,
    items: [
      { id: 'meal-planner', title: 'Meal planner', state: 'approved', archivedAt: null },
      { id: 'search-v2', title: 'Search v2', state: 'approved', archivedAt: null },
    ],
  }))
  const session = (slot: string, role: string, status: string, minutes: number) => ({
    slot,
    role,
    status,
    attempt: 1,
    link: `/sessions/${slot}`,
    boundAt: ago(minutes + 20),
    statusAt: ago(minutes),
    agent: 'kirocrew-worker',
    model: null,
  })
  const item = (id: string, title: string, extra = {}) => ({
    id,
    title,
    status: 'planned',
    complete: false,
    repository: null,
    authority: 'local',
    sessions: [],
    evidence: [],
    integration: null,
    pullRequests: [],
    deliveries: [],
    worktrees: [],
    issue: null,
    ...extra,
  })
  answer('delivery.view', () => ({
    revision: 1,
    items: [
      item('m3', 'Sync pantry items between devices', {
        status: 'running',
        sessions: [session('chat-m3', 'worker', 'coding', 4)],
        deliveries: [{ state: 'running', updatedAt: ago(4) }],
      }),
      item('s1', 'Index recipes by ingredient', {
        status: 'review',
        sessions: [session('chat-s1', 'reviewer', 'reading', 95)],
        deliveries: [{ state: 'done', updatedAt: ago(95) }],
      }),
      item('s6', 'Recipe tags', {
        status: 'done',
        complete: true,
        integration: { commit: 'c1', branch: 'main', at: ago(60 * 26) },
        pullRequests: [{ number: 41, url: 'https://github.com/acme/recipe-box/pull/41', merged: true }],
      }),
      item('m5', 'Meal plan calendar', {
        status: 'done',
        complete: true,
        integration: { commit: 'c2', branch: 'main', at: ago(60 * 24 * 9) },
        pullRequests: [{ number: 33, url: 'https://github.com/acme/recipe-box/pull/33', merged: true }],
      }),
    ],
  }))
  const need = (key: string, kind: string, taskId: string | null, title: string, detail: string) => ({
    key,
    kind,
    taskId,
    title,
    detail,
    plan: 'search-v2',
    epic: null,
    repository: 'acme/recipe-box',
    since: ago(50),
  })
  answer('conflicts.view', () => ({
    revision: 1,
    items: [
      need('n1', 'decision', 's2', 'Rank results by cooking time', 'Pick a ranking rule: total time, or active time only. Dependents wait on this answer.'),
      need('n2', 'needs-human', 'm2', 'Scale servings in the recipe card', 'The crew asks whether servings round up or down when scaling.'),
      need('n4', 'branch-landing', null, 'Search v2 integration branch', 'Checks passed on the branch head. Approve it to land on main.'),
    ],
  }))
  answer('landing.view', () => ({
    queue: [
      {
        key: 'q1',
        base: 'main',
        repository: 'acme/recipe-box',
        tasks: [{ id: 's1', title: 'Index recipes by ingredient' }],
        pr: 47,
        url: 'https://github.com/acme/recipe-box/pull/47',
        position: 0,
        queuedAt: ago(12),
        held: 'Next to land; checks run on the next tick.',
      },
      {
        key: 'q2',
        base: 'main',
        repository: 'acme/recipe-box',
        tasks: [{ id: 'm3', title: 'Sync pantry items between devices' }],
        pr: 48,
        url: 'https://github.com/acme/recipe-box/pull/48',
        position: 1,
        queuedAt: ago(6),
        held: 'Behind 1 portion.',
      },
    ],
    landed: [
      {
        key: 'l1',
        base: 'main',
        repository: 'acme/recipe-box',
        tasks: [{ id: 's6', title: 'Recipe tags' }],
        pr: 41,
        url: 'https://github.com/acme/recipe-box/pull/41',
        at: ago(60 * 26),
      },
      {
        key: 'l2',
        base: 'main',
        repository: 'acme/recipe-box',
        tasks: [
          { id: 's7', title: 'Ingredient synonyms' },
          { id: 's8', title: 'Synonym admin' },
        ],
        pr: 39,
        url: 'https://github.com/acme/recipe-box/pull/39',
        at: ago(60 * 50),
      },
      {
        key: 'l3',
        base: 'main',
        repository: 'acme/recipe-box',
        tasks: [{ id: 'm6', title: 'Pantry barcode scan' }],
        pr: 36,
        url: 'https://github.com/acme/recipe-box/pull/36',
        at: ago(60 * 24 * 4),
      },
    ],
    landedThisWeek: 3,
  }))
  const metrics = { tasks: 4, leadTimeMs: 52 * 60000, flowEfficiency: 0.62, firstPassRate: 0.75, changeFailureRate: 0, integrationsPerDay: 1.2, timeToFixMs: null }
  const byClass = { code: { task: { minutes: 64, pullRequests: 6 }, other: { minutes: 12, pullRequests: 2 } } }
  answer('flow.view', () => ({
    window: { size: 10, since: null },
    metrics,
    previous: metrics,
    bottleneck: null,
    tasks: [],
    stops: [],
    line: [],
    flaky: [{ id: 'f1', check: 'test (windows)', commit: 'c1', at: ago(300) }],
    ciOnly: [],
    retros: [],
    batches: [],
    stages: [],
    repositories: ['acme/recipe-box', 'acme/docs'],
    epics: [],
    series: { day: [], week: [] },
    usage: { available: false, total: { input: 0, output: 0, credits: 0, turns: 0 }, byTask: [], byPlan: [], byStage: [], byModel: [], byDay: [], byWeek: [] },
    ci: {
      repositories: [
        {
          repository: 'acme/recipe-box',
          windowDays: 14,
          byClass,
          waitShare: 0.18,
          waitLimit: 0.25,
          closedPullRequests: 14,
          repeats: [{ workflow: 'ci', commits: 2, extraRuns: 2, extraMinutes: 9 }],
        },
        { repository: 'acme/docs', windowDays: 14, byClass, waitShare: 0.34, waitLimit: 0.25, closedPullRequests: 5, repeats: [] },
      ],
    },
  }))
}
// &inline=1: a stateful backend for the Settings pages that edit in place.
if (query.get('page') === 'app' && query.get('inline') === '1') installInlineFixture()
// &crewmode=1: a workspace a Crew Mode conductor drove, held for a person.
if (query.get('page') === 'app' && query.get('crewmode') === '1') {
  answer('conflicts.view', () => ({
    revision: 1,
    items: [
      {
        kind: 'needs-human',
        reason: 'crew-mode',
        id: 'crew-mode',
        taskId: null,
        title: 'The tick does not start this workspace yet',
        detail:
          'This workspace\'s .avoozl.json still says "runner": "crew-mode", from before the tick started every task. Avoozl starts nothing here until you let the tick run it.',
        hash: 'h1',
      },
    ],
  }))
  answer('delivery.runner.release', () => ({ released: true }))
}
// &delivery=1: tasks in every Delivery lane across two epics and specs.
if (query.get('page') === 'app' && query.get('delivery') === '1') {
  const at = '2026-11-16T09:00:00Z'
  const t = (id: string, title: string, epic: string, planId: string, repository: string, extra = {}) => ({
    ...task(id, epic),
    title,
    planId,
    spec: planId,
    repository,
    phase: null,
    ...extra,
  })
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
  const session = (slot: string, role: string, status: string) => ({
    slot,
    role,
    status,
    attempt: 1,
    link: `/sessions/${slot}`,
    boundAt: at,
    statusAt: at,
    agent: 'kirocrew-worker',
    model: null,
  })
  const item = (id: string, title: string, extra = {}) => ({
    id,
    title,
    status: 'planned',
    complete: false,
    repository: null,
    authority: 'local',
    sessions: [],
    evidence: [],
    integration: null,
    pullRequests: [],
    deliveries: [],
    worktrees: [],
    issue: null,
    ...extra,
  })
  const deliveryItems = [
    item('m3', 'Sync pantry items between devices', { status: 'running', sessions: [session('chat-m3', 'worker', 'coding')], deliveries: [{ state: 'running', updatedAt: at }] }),
    item('s1', 'Index recipes by ingredient', { status: 'review', sessions: [session('chat-s1', 'reviewer', 'reading')], deliveries: [{ state: 'done', updatedAt: at }] }),
    item('s2', 'Rank results by cooking time', { deliveries: [{ state: 'decision', updatedAt: at }] }),
  ]
  answer('delivery.view', () => ({
    revision: 1,
    items: deliveryItems,
    contentReports: [],
    // &machines=1: this Mac runs 3 chats of 3 lanes; a remote host runs 2.
    laneLimit: query.get('machines') ? 3 : null,
  }))
  if (query.get('machines')) {
    for (const [id, title] of [
      ['r1', 'Cache the pantry index'],
      ['r2', 'Batch the sync uploads'],
    ]) {
      graphTasks.push(t(id, title, 'e1', 'meal-planner', 'recipe-box', { state: 'running', status: 'running' }))
      deliveryItems.push(item(id, title, { status: 'running', deliveries: [{ state: 'running', updatedAt: at }] }))
    }
    deliveryItems.push(
      item('m4', 'Export meal plans as PDF', { status: 'running', sessions: [session('chat-m4', 'worker', 'coding')], deliveries: [{ state: 'running', updatedAt: at }] }),
    )
    graphTasks.push(t('m4', 'Export meal plans as PDF', 'e1', 'meal-planner', 'recipe-box', { state: 'running', status: 'running' }))
    const worker = (taskId: string, n: number) => ({
      host: 'dev desktop',
      crewId: 'crew-dev',
      taskId,
      state: 'running',
      chatKey: `chat-${n}`,
      status: 'coding',
      updatedAt: at,
      attachUrl: null,
      stale: false,
      lastOkAt: at,
    })
    answer('remote.view', () => ({ workers: [worker('r1', 1), worker('r2', 2)] }))
  }
  // &batch=1: a planner batch of three running in one chat (R108.9), and a
  // grouped task that runs alone because its group broke a rule.
  if (query.get('batch')) {
    const run = { id: 'batch:docs:m5+m6+m7', group: 'docs', tasks: ['m5', 'm6', 'm7'], leader: 'm5', reason: 'Three one-line fixes in the recipe card help text', state: 'running' }
    for (const [id, title] of [
      ['m5', 'Fix the servings tooltip'],
      ['m6', 'Fix the prep time label'],
      ['m7', 'Fix the allergen note link'],
    ]) {
      graphTasks.push(t(id, title, 'e1', 'meal-planner', 'recipe-box', { state: 'running', status: 'running' }))
      deliveryItems.push(
        item(id, title, {
          status: 'running',
          batch: run.id,
          batchGroup: run,
          sessions: id === 'm5' ? [session('chat-m5', 'worker', 'coding')] : [],
          deliveries: [{ state: 'running', updatedAt: at, batch: run.id }],
        }),
      )
    }
    graphTasks.push(t('s5', 'Rename the search box label', 'e2', 'search-v2', 'search', { state: 'running', status: 'running' }))
    deliveryItems.push(
      item('s5', 'Rename the search box label', {
        status: 'running',
        alone: 's6 waits on s5',
        batchGroup: { id: null, group: 'labels', tasks: ['s5', 's6'], leader: 's5', reason: 'Two label renames', state: null },
        sessions: [session('chat-s5', 'worker', 'coding')],
        deliveries: [{ state: 'running', updatedAt: at }],
      }),
    )
    // Each member's details name the batch and link to its leader.
    answer('task.detail', (body) => {
      const id = (body.input as { id: string }).id
      const base = baseDetail(),
        delivery = deliveryItems.find((entry) => entry.id === id) ?? null
      return {
        ...base,
        summary: summaryAt('none'),
        task: {
          ...base.task,
          id,
          title: delivery?.title ?? id,
          manual: false,
          completion: 'integrated',
          authority: 'local',
          route: 'local',
          issue: null,
          state: 'running',
          status: 'running',
          repository: 'recipe-box',
          phase: null,
        },
        waitsOn: [],
        blocks: [],
        delivery,
      }
    })
  }
  // The line, for the Delivery heading's Stop the line: a stop opens one,
  // Resume closes it. window.__lineCalls records both. &stopped=1 starts stopped.
  const lineWin = window as unknown as { __lineCalls: unknown[] }
  lineWin.__lineCalls = []
  const open = (reason: string) => ({
    id: 'l1',
    manual: true,
    by: { kind: 'person', name: 'you' },
    reason,
    scope: 'all',
    closedAt: null,
    branch: 'main',
    check: null,
    openedAt: at,
  })
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
    statuses: [
      { id: 'planned', label: 'Planned', complete: false },
      { id: 'done', label: 'Done', complete: true },
    ],
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
    id,
    title,
    status: 'running',
    complete: false,
    repository: 'recipe-box',
    authority: 'local',
    sessions,
    evidence: [],
    integration: null,
    pullRequests: [],
    deliveries: [{ state: 'running', updatedAt: at }],
    worktrees: [],
    issue: null,
  })
  answer('delivery.view', () => ({
    revision: 1,
    items: [
      item('m3', 'Sync pantry items between devices', [
        {
          slot: `process-${uuid}`,
          role: 'worker',
          attempt: 1,
          title: null,
          status: 'working',
          statusAt: at,
          boundAt: at,
          model: 'claude-sonnet',
          crew: 'local',
          executor: 'process',
          link: null,
          process: { harness: 'claude-code', state: 'running', exitCode: null, run: 2, logTail: log, cost: 0.83, attach: `cd /work/recipe-box-m3 && claude --resume ${uuid}` },
        },
      ]),
      item('s1', 'Index recipes by ingredient', [
        {
          slot: 'chat-s1',
          role: 'reviewer',
          attempt: 1,
          title: null,
          status: 'reading',
          statusAt: at,
          boundAt: at,
          agent: 'kirocrew-worker',
          model: null,
          crew: 'local',
          executor: 'kirocrew',
          link: '/chat?sid=chat-s1',
        },
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
  const t = (id: string, title: string) => ({
    ...task(id, 'e1'),
    title,
    planId: 'meal-planner',
    spec: 'meal-planner',
    repository: 'recipe-box',
    phase: null,
    state: 'running',
    status: 'running',
  })
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
    statuses: [
      { id: 'planned', label: 'Planned', complete: false },
      { id: 'done', label: 'Done', complete: true },
    ],
    repositories: ['recipe-box'],
    total: rows.length,
    tasks: rows.map(([id, title]) => t(id, title)),
    edges: [],
  }))
  const repo = 'https://github.com/acme/recipe-box'
  answer('delivery.view', () => ({
    revision: 1,
    items: rows.map(([id, title, role, ref, pr, dot], index) => ({
      id,
      title,
      status: 'running',
      complete: false,
      repository: 'recipe-box',
      authority: 'local',
      evidence: [],
      integration: null,
      pullRequests: [],
      deliveries: [{ state: 'running', updatedAt: at }],
      worktrees: [],
      issue: null,
      sessions: [
        {
          slot: `chat-${id}`,
          role,
          attempt: 1,
          title: null,
          status: 'working',
          statusAt: new Date(Date.now() - (index + 1) * 60000).toISOString(),
          boundAt: at,
          agent: 'kirocrew-worker',
          model: 'claude-sonnet',
          crew: 'local',
          executor: 'kirocrew',
          link: `/chat?sid=chat-${id}`,
        },
      ],
      links: {
        branch: { kind: 'branch', repository: 'acme/recipe-box', ref, url: `${repo}/tree/${ref}` },
        pr: pr ? { kind: 'pull', repository: 'acme/recipe-box', number: pr, url: `${repo}/pull/${pr}`, state: 'open' } : null,
        checks: dot
          ? {
              state: dot === 'stale' ? 'pass' : dot,
              dot,
              head: (dot === 'stale' ? 'b' : 'a').repeat(40),
              ageMs: (index + 2) * 60000,
              current: dot !== 'stale',
              url: `${repo}/pull/${pr}/checks`,
            }
          : null,
      },
    })),
    contentReports: [],
  }))
}
// ?page=app&basic=1: the Dashboard on a quiet workspace with nothing in flight.
if (query.get('basic') === '1') {
  answer('delivery.view', () => ({ revision: 1, items: [] }))
  answer('conflicts.view', () => ({
    revision: 1,
    items:
      query.get('tickfail') === '1'
        ? [
            {
              kind: 'tick-failed',
              id: 'tick-failed',
              taskId: null,
              title: 'The tick failed 3 times in a row',
              detail: 'database is locked. Nothing is dispatched, merged or read from GitHub until a tick works.',
              failures: 3,
              openedAt: '2026-11-13T11:30:00Z',
              planArchived: null,
            },
          ]
        : [],
  }))
  answer('plan.list', () => ({ items: [] }))
  answer('remote.view', () => ({ workers: [] }))
  const noMetrics = { tasks: 0, leadTimeMs: null, flowEfficiency: null, firstPassRate: null, changeFailureRate: null, integrationsPerDay: null, timeToFixMs: null }
  const noUsage = { input: 0, output: 0, credits: 0, turns: 0 }
  answer('flow.view', () =>
    query.get('receipt')
      ? {
          window: { size: 20, since: null },
          metrics: noMetrics,
          previous: noMetrics,
          bottleneck: null,
          tasks: [],
          stops: [],
          line: [],
          flaky: [],
          ciOnly: [],
          retros: [],
          batches: [],
          stages: [],
          repositories: ['acme/recipe-box'],
          epics: [],
          series: { day: [], week: [] },
          usage: { available: false, total: noUsage, byTask: [], byPlan: [], byStage: [], byModel: [], byDay: [], byWeek: [] },
        }
      : { line: [], stages: [], tasks: [], retros: [] },
  )
  answer('radar.releasequeue', () => ({ repositories: [] }))
}
// ?page=app&flow=1: Flow and Settings ›
// Flow, for the owner-rule screenshots (flow-rules-shots.mjs).
if (query.get('page') === 'app' && query.get('flow') === '1') {
  const metrics = { tasks: 1, leadTimeMs: 52 * 60000, flowEfficiency: 0.62, firstPassRate: 1, changeFailureRate: 0, integrationsPerDay: null, timeToFixMs: null }
  const usage = { available: false, total: { input: 0, output: 0, credits: 0, turns: 0 }, byTask: [], byPlan: [], byStage: [], byModel: [], byDay: [], byWeek: [] }
  const stages = { queued: 4 * 60000, coding: 30 * 60000, tests: 8 * 60000, 'ci-wait': 10 * 60000 }
  const task = {
    taskId: 'search.3',
    title: 'Index builder',
    repository: 'acme/recipe-box',
    epic: null,
    startedAt: '2026-11-15T09:00:00Z',
    finishedAt: '2026-11-15T09:52:00Z',
    leadMs: 52 * 60000,
    activeMs: 38 * 60000,
    stages,
    coarse: false,
    sources: ['tool-calls'],
    batch: null,
    firstPass: true,
  }
  answer('flow.view', () => ({
    window: { size: 20, since: null },
    metrics,
    previous: metrics,
    bottleneck: null,
    tasks: [task],
    // ?stops=1: a pulled stop still open, a pulled one resumed and an
    // automatic one fixed, for Flow's Line stops list (R64.11).
    stops: query.get('stops')
      ? [
          {
            id: 'stop:pulled:1',
            manual: true,
            by: { kind: 'person', name: 'Michael Dowling' },
            reason: 'bad base',
            scope: 'task',
            taskId: 'search.3',
            repositoryId: 'acme/recipe-box',
            openedAt: '2026-11-15T10:30:00Z',
            closedAt: '2026-11-15T10:56:00Z',
            timeToFixMs: 26 * 60000,
            branch: 'main',
            check: null,
          },
          {
            id: 'stop:r1:1',
            manual: false,
            check: 'npm test',
            branch: 'main',
            repositoryId: 'acme/recipe-box',
            culprit: null,
            openedAt: '2026-11-15T10:17:00Z',
            closedAt: '2026-11-15T10:20:00Z',
            timeToFixMs: 3 * 60000,
          },
          {
            id: 'stop:pulled:2',
            manual: true,
            by: { kind: 'agent', name: 'session:dashboard:worker-a1' },
            who: 'worker for search.3',
            reason: 'worker found a broken base in acme/recipe-box',
            scope: 'repo',
            repositoryId: 'acme/recipe-box',
            openedAt: '2026-11-15T10:01:00Z',
            closedAt: null,
            branch: 'main',
            check: null,
          },
        ]
      : [],
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
    return {
      taskId,
      title,
      repository,
      epic: null,
      plan,
      phase: null,
      startedAt: `2026-11-${at}T09:00:00Z`,
      finishedAt: `2026-11-${at}T10:00:00Z`,
      leadMs,
      activeMs: leadMs,
      stages,
      coarse: false,
      sources: ['tool-calls'],
      batch: null,
      firstPass: true,
    }
  }
  const all = [
    mk('search.3', 'Index builder', 'acme/recipe-box', 'search', '15', { queued: 4 * min, coding: 30 * min, tests: 8 * min, 'ci-wait': 10 * min }),
    mk('search.4', 'Ranking', 'acme/recipe-box', 'search', '16', { queued: 2 * min, coding: 12 * min, 'ci-wait': 40 * min }),
    mk('pantry.1', 'Shelf list', 'acme/pantry', 'pantry', '14', { queued: 6 * min, coding: 20 * min, review: 15 * min }),
  ]
  const retros = [
    {
      id: 'retro-2',
      n: 2,
      state: 'done',
      triggers: [{ kind: 'count', detail: '10 tasks finished' }],
      startedAt: '2026-11-16T12:00:00Z',
      finishedAt: '2026-11-16T12:09:00Z',
      model: 'claude-sonnet',
      chat: { slot: 'avoozl_retro_2', executor: 'kirocrew', harness: null, status: 'idle', link: '/chat?sid=avoozl_retro_2' },
      bottleneck: { stage: 'ci-wait', repository: 'acme/recipe-box', evidence: 'CI wait was 58% of lead time over 8 tasks.' },
      dropped: [],
      proposals: [
        {
          id: 'p1',
          type: 'settings',
          file: 'workspace',
          key: 'flow.retro.slowFactor',
          from: 3,
          to: 5,
          metric: 'lead time',
          direction: 'down',
          evidence: 'Retros fired on 6 normal tasks.',
          status: 'open',
        },
        {
          id: 'p2',
          type: 'prompt',
          target: 'worker',
          section: 'Checks',
          diff: '@@ -1,2 +1,2 @@\n Run the checks.\n-Run all tests.\n+Run the tests you touched first.',
          metric: 'first-pass rate',
          direction: 'up',
          evidence: 'Two reviews asked for narrower runs.',
          status: 'open',
        },
      ],
    },
    {
      id: 'retro-4',
      n: 4,
      state: 'failed',
      failure: 'no-reply',
      waitedMs: 11 * min,
      error: 'the chat started but never replied (waited 11 minutes)',
      triggers: [{ kind: 'count', detail: '10 tasks finished' }],
      startedAt: '2026-11-17T09:00:00Z',
      finishedAt: '2026-11-17T09:11:00Z',
      bottleneck: null,
      dropped: [],
      proposals: [],
      chat: {
        slot: 'avoozl_retro_4',
        executor: 'process',
        harness: 'claude-code',
        status: 'closed',
        link: null,
        process: { state: 'exited', logTail: 'reading the window\nwriting the reply\nerror: the model call was cut off', attach: 'tail -n 20 -f /tmp/avoozl/retro-4.log' },
      },
    },
    {
      id: 'retro-3',
      n: 3,
      state: 'failed',
      failure: 'lost',
      waitedMs: 11 * min,
      error: 'the chat was lost: Kiro Crew no longer lists it (waited 11 minutes)',
      triggers: [{ kind: 'manual', detail: 'started by hand' }],
      startedAt: '2026-11-16T20:00:00Z',
      finishedAt: '2026-11-16T20:11:00Z',
      bottleneck: null,
      dropped: [],
      proposals: [],
      chat: { slot: 'avoozl_retro_3', executor: 'kirocrew', harness: null, status: 'gone', link: '/chat?sid=avoozl_retro_3' },
    },
    {
      id: 'retro-1',
      n: 1,
      state: 'done',
      triggers: [{ kind: 'count', detail: '10 tasks finished' }],
      startedAt: '2026-11-12T12:00:00Z',
      finishedAt: '2026-11-12T12:08:00Z',
      bottleneck: null,
      dropped: [],
      proposals: [
        {
          id: 'p1',
          type: 'rule',
          text: 'Name the spec in every commit message.',
          metric: 'corrections',
          direction: 'down',
          evidence: { runs: ['search.1', 'search.2'], value: 2, effect: 'corrections' },
          status: 'approved',
        },
      ],
    },
  ].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
  answer('flow.view', (body) => {
    const input = ((body as { input?: Record<string, string> }).input ?? {}) as Record<string, string>
    const tasks = all.filter(
      (t) => (!input.repository || t.repository === input.repository) && (!input.plan || t.plan === input.plan) && (!input.stage || (t.stages[input.stage] ?? 0) > 0),
    )
    const lead = tasks.length ? tasks.map((t) => t.leadMs).sort((a, b) => a - b)[Math.floor(tasks.length / 2)] : null
    const metrics = { tasks: tasks.length, leadTimeMs: lead, flowEfficiency: 0.6, firstPassRate: 1, changeFailureRate: 0, integrationsPerDay: null, timeToFixMs: null }
    const point = (t: (typeof all)[number]) => ({
      key: t.finishedAt.slice(0, 10),
      tasks: 1,
      leadTimeMs: t.leadMs,
      flowEfficiency: 0.6,
      firstPassRate: 1,
      timeToFixMs: null,
      stages: t.stages,
    })
    return {
      window: { size: Number(input.window ?? 20), since: null },
      metrics,
      previous: metrics,
      bottleneck: null,
      tasks,
      stops: [],
      line: [],
      flaky: [],
      ciOnly: [],
      retros,
      batches: [],
      stages: ['queued', 'coding', 'tests', 'ci-wait', 'review'],
      repositories: ['acme/pantry', 'acme/recipe-box'],
      epics: [],
      plans: [
        { id: 'pantry', title: 'Pantry' },
        { id: 'search', title: 'Search' },
      ],
      phases: [],
      series: { day: tasks.map(point), week: tasks.map(point) },
      usage: noUsage,
    }
  })
  answer('flow.proposals', () => ({
    proposals: retros.flatMap((r) => r.proposals.map((p) => ({ retro: r.id, ...p }))),
    dropped: [],
    prompts: [{ target: 'worker', version: 'built-in', shipped: 'abc', active: 0, versions: [], sections: [], drift: [] }],
    notes: [],
    available: true,
  }))
  answer('flow.settings.get', () => ({ filename: '.avoozl.json', exists: true, hash: 'h', flow: {}, repositories: {}, instructions: '', retroPrompt: null, ciClassGlobs: {} }))
  answer('flow.retro.decide', () => ({ ok: true }))
  answer('flow.retro.again', () => ({ queued: true }))
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
    <div
      {...{ [APP_ATTR]: '' }}
      style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}
    >
      <Tooltip text="Opened 2026-11-14 by Mira">
        <span data-plain>opened 3 days ago</span>
      </Tooltip>
      <span data-info-wrap>
        <InfoTip text="Details that do not fit on the page" />
      </span>
      <Tooltip text="Stops all new work">
        <Btn data-act onClick={() => setClicks(clicks + 1)}>
          Stop
        </Btn>
      </Tooltip>
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
      <div
        data-host-header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          color: 'var(--text)',
        }}
      >
        Host header
      </div>
      <div
        data-host-pane
        style={{ position: 'fixed', top: 48, left: 0, right: 0, bottom: 0, overflowY: 'auto', transform: 'translateZ(0)', background: 'var(--bg)', color: 'var(--text)' }}
      >
        <div {...{ [APP_ATTR]: '' }} style={{ display: 'contents' }}>
          <NavHistoryProvider>
            <ConfirmProvider>
              <SpecLinkContext.Provider value={(planId) => state.calls.push({ operation: 'open-spec', input: { planId } })}>
                <TaskDrawerProvider workspaceId="w" onFocus={() => undefined}>
                  <div style={{ display: 'flex', gap: 16, padding: 16, minHeight: 2400 }}>
                    <aside
                      data-sticky-column
                      style={{
                        position: 'sticky',
                        top: 8,
                        alignSelf: 'flex-start',
                        zIndex: LAYER.sticky,
                        width: '28%',
                        minHeight: 300,
                        padding: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-elevated)',
                      }}
                    >
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
              </SpecLinkContext.Provider>
            </ConfirmProvider>
          </NavHistoryProvider>
        </div>
      </div>
    </>
  )
}

// ?page=github-flow: Flow's Builds on twelve build records.
if (query.get('page') === 'github-flow' || (query.get('page') === 'app' && query.get('receipt')))
  answer('builds.view', () => ({
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
  }))
// ?page=repo-mode: one repository's Edit body on its Landing tab.
function RepoModePage() {
  const [repository, setRepository] = useState<RepositoryForm>(emptyRepository('acme/recipe-box'))
  const [tab, setTab] = useState<EditTab>('landing')
  const choices = { modes: ['local', 'plans-repo', 'single-repo'], authorities: [], permissions: [] }
  return (
    <NavHistoryProvider>
      <RepositoryEditor
        index={0}
        repository={repository}
        choices={choices as never}
        review={undefined}
        mode="single-repo"
        workspaceId="w"
        planningRepository=""
        tab={tab}
        onTab={setTab}
        onChange={setRepository}
      />
    </NavHistoryProvider>
  )
}

// ?page=workspaces: Settings > Workspaces on two workspaces; window.__wsCalls
// records stop and remove. &stopped=1 starts the first one turned off.
const wsWin = window as unknown as { __wsCalls: string[] }
if (query.get('page') === 'workspaces') {
  wsWin.__wsCalls = []
  let items = [
    {
      id: 'launch',
      name: 'Product launch',
      root: '/plans/launch',
      enabled: query.get('stopped') !== '1',
      state: query.get('stopped') === '1' ? 'stopped' : 'closed',
      served: true,
    },
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
    roles: { planner: { model: 'fake-writer' } } as Record<string, Record<string, string>>,
    harnessDefinitions: [
      { name: 'claude-code', approved: true, model: true, readRoles: null, proved: ['read', 'write'] },
      { name: 'codex', approved: false, model: false, readRoles: 'codex names no resultAllow, so a read-only session cannot write its result file.', proved: ['write'] },
    ],
  }
  answer('GET /api/models', () => ['fake-writer', 'fake-reviewer'])
  answer('models.settings.get', () => settings)
  answer('models.settings.update', (body) => {
    state.calls.push(body)
    const input = body.input as { roles: typeof settings.roles }
    settings = { ...settings, hash: 'models-after', roles: input.roles }
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
        resources: {
          core: { limit: 5000, remaining: 1078, resetAt: new Date(Date.now() + 22 * 60000).toISOString() },
          graphql: { limit: 5000, remaining: 4890, resetAt: new Date(Date.now() + 40 * 60000).toISOString() },
        },
        limitedUntil: null,
        limitedResource: null,
        calls: 214,
        notModified: 61,
        notModifiedShare: 61 / 214,
        hourCalls: 153,
        writes: { perMinute: 60, perHour: 400, run: { planId: 'nupp', done: 312, total: 1740, resumeAt: new Date(Date.now() + 38 * 60000).toISOString() } },
        bySource: {
          tick: { calls: 88, notModified: 40, cached: 0 },
          crew: { calls: 41, notModified: 0, cached: 0 },
          view: { calls: 17, notModified: 21, cached: 132 },
          review: { calls: 5, notModified: 0, cached: 3 },
          setup: { calls: 2, notModified: 0, cached: 0 },
        },
      }}
    />
  ),
  'repo-mode': () => <RepoModePage />,
  'github-flow': () => <FlowBuilds workspaceId="w" />,
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
            <PluginsSettings workspaceId="w" onOpenGitHub={() => {}} onOpenRepositories={() => {}} />
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
  const base = Array.from({ length: 24 }, (_, at) => {
    const seq = 24 - at
    return {
      seq,
      at: new Date(Date.parse('2026-11-13T10:00:00Z') - at * 3600e3).toISOString(),
      source: sources[at % 4],
      actor: actors[(at * 3) % 4],
      kind: kinds[at % kinds.length],
      summary: `${kinds[at % kinds.length]} entry ${seq}`,
      targetId: null,
      link: null,
      redacted: false,
    }
  })
  // New items from GitHub: the owner/repo#N text links to the item.
  if (query.get('ghitems') === '1') {
    base[1] = { ...base[1], source: 'github', kind: 'intake.item', summary: 'New pr nupp-lang/foo#12 from github', link: null }
    base[5] = { ...base[5], source: 'github', kind: 'intake.item', summary: 'New issue nupp-lang/bar#7 from github', link: 'https://github.com/nupp-lang/bar/issues/7' }
    kinds.push('intake.item')
  }
  // The tick's own rows: a failure with a count, a stall and a recovery.
  const tickRow = (seq: number, hours: number, kind: string, summary: string) => ({
    seq,
    at: new Date(Date.parse('2026-11-13T10:00:00Z') + hours * 3600e3).toISOString(),
    source: 'tick',
    actor: 'avoozl',
    kind,
    summary,
    targetId: null,
    link: null,
    redacted: false,
  })
  const all = [
    tickRow(27, 2, 'tick.recovered', 'Tick works again after 5 failures'),
    tickRow(26, 1.5, 'tick.failed', 'Tick failed 5 times in a row: database is locked'),
    tickRow(25, 0.5, 'tick.stalled', 'Tick had not run for 42 min; it is running again'),
    ...base,
  ]
  sources.push('tick')
  kinds.push('tick.failed', 'tick.recovered', 'tick.stalled')
  const count = (key: 'source' | 'kind' | 'actor') => {
    const out: Record<string, number> = {}
    for (const row of all) out[row[key]] = (out[row[key]] ?? 0) + 1
    return out
  }
  answer('activity.list', (body) => {
    const input = body.input as { source?: string; kind?: string; actor?: string }
    const items = all.filter((row) => (!input.source || row.source === input.source) && (!input.kind || row.kind === input.kind) && (!input.actor || row.actor === input.actor))
    return {
      items,
      total: items.length,
      sources: [...sources].sort(),
      kinds: [...kinds].sort(),
      actors: [...actors].sort(),
      counts: { source: count('source'), kind: count('kind'), actor: count('actor') },
      retentionDays: 30,
    }
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
  const entry = (id: string, batch: number, tasks: number, hash: string, extra = {}) => ({
    id,
    spec: id,
    title: id,
    hash: hash.repeat(64 / hash.length),
    batch,
    tasks,
    errors: 0,
    loop: false,
    needs: [],
    ...extra,
  })
  const batches = [
    { batch: 1, specs: [entry('core-design-values', 1, 4, 'b9dc37bf'), entry('math-matrix-math', 1, 5, 'b18266e9'), entry('public-cli-module', 1, 3, '4b5afd31')] },
    {
      batch: 2,
      specs: [
        entry('byte-types', 2, 8, '98f38c3b', { loop: true, needs: ['compression', 'core-design-values'] }),
        entry('compression', 2, 12, 'f1551aa3', { loop: true, needs: ['byte-types'] }),
        entry('nupp-native-runtime-winddown-2026-11-11', 2, 131, '3a271abe', { loop: true, needs: ['compression'] }),
      ],
    },
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
    const summary = {
      name: 'byte-types',
      folder: '.kiro/specs/byte-types/',
      type: 'feature',
      hash,
      files: Object.keys(files),
      counts: { error: 0, warning: 0, info: 0 },
      taskCount: 2,
      critique: null,
      plan: { id: 'byte-types', state: 'draft', hash, revision: 3, changed: false, approved: false },
    }
    answer('plan.table', () => ({ root: '/repo', problem: null, specs: [summary], revision: 7, items }))
    answer('plan.preview', () => ({ reviewedHash: at, expectedRevision: 3, tasks: [], dependencies: [] }))
    answer('plan.spec.read', () => ({ name: 'byte-types', folder: '.kiro/specs/byte-types/', hash, documents: files }))
    answer('plan.review.view', () => structuredClone(fixture.data))
    // The Approve dialogs' summary (task 57.6): counts by severity and state.
    // window.__moveRevision() stands for the planner writing a revision while
    // a dialog is open: one finding becomes fixed and one moves.
    for (const batch of batches) for (const spec of batch.specs) if (spec.id === 'byte-types') spec.hash = hash
    const moved = 'd00dfeed'.repeat(8)
    const movedFiles = {
      ...files,
      'requirements.md': files['requirements.md'] + '\n3. A test SHALL show 255 + 1 wraps to 0.',
      'tasks.md': files['tasks.md'] + '\n- [ ] 1.3 Test overflow wraps',
    }
    ;(window as unknown as { __moveRevision: () => void }).__moveRevision = () => {
      at = moved
    }
    let summaryReady = false
    ;(window as unknown as { __summaryReady: () => void }).__summaryReady = () => {
      summaryReady = true
    }
    answer('graph.view', () => specGraph)
    const reviewOf = () => {
      const now = at === moved
      const open = fixture.data.findings
        .filter((f) => f.state !== 'rejected')
        .map((f) => ({
          id: f.id,
          roundId: f.roundId,
          revisionHash: f.revisionHash,
          current: true,
          kind: f.category,
          severity: f.severity,
          file: f.anchor.file,
          line: f.anchor.lineStart,
          statement: f.statement,
          evidence: f.evidence,
          answer: f.answer,
          state: now && f.id === 'f-blocker' ? 'fixed' : f.state,
          anchor: { ...f.anchor, moved: f.id === 'f-moved' ? now : false },
        }))
      const byState: Record<string, number> = { rejected: 1 }
      for (const f of open) byState[f.state] = (byState[f.state] ?? 0) + 1
      // Open findings by severity, live as the person decides them.
      const openBySeverity = { blocker: 0, warn: 0, info: 0 }
      for (const f of fixture.data.findings) if (['open', 'answered', 'for you', 'accepted'].includes(f.state)) openBySeverity[f.severity]++
      // &summary=running: the reviewer is still writing it (the AI working
      // box) until window.__summaryReady(); &summary=none: none, no review.
      const running = query.get('summary') === 'running' && !summaryReady
      const summary =
        query.get('summary') === 'none' || running
          ? null
          : {
              text: 'Adds fixed-width byte types and byte strings to the runtime, with UTF-8 conversion. It covers three requirements and two tasks.',
              revisionHash: hash,
              current: !now,
            }
      return {
        state: running ? 'running' : 'done',
        planHash: at,
        reviewerModel: 'fake-reviewer',
        writerModel: 'fake-writer',
        revisionHash: hash,
        current: !now,
        found: fixture.data.findings.length,
        fixed: byState.fixed ?? 0,
        forYou: byState['for you'] ?? 0,
        bySeverity: fixture.data.bySeverity,
        openBySeverity,
        byState,
        summary,
        note: null,
        open,
      }
    }
    const entryHash = (id: string) => batches.flatMap((b) => b.specs).find((e) => e.id === id)?.hash
    answer('plan.reviewSummary', (body) => {
      const id = (body.input as { planId: string }).planId
      return id === 'byte-types'
        ? reviewOf()
        : {
            state: 'not-reviewed',
            planHash: entryHash(id),
            reviewerModel: null,
            revisionHash: null,
            current: false,
            found: 0,
            fixed: 0,
            forYou: 0,
            bySeverity: { blocker: 0, warn: 0, info: 0 },
            byState: {},
            note: null,
            open: [],
          }
    })
    answer('plan.get', () => ({
      id: 'byte-types',
      spec: 'byte-types',
      title: 'Byte types',
      hash: at,
      revision: at === moved ? 4 : 3,
      state: 'draft',
      files: at === moved ? movedFiles : files,
      approvals: [],
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
  // &specpr=1 (or =draft): an open pull request proposes a change to
  // byte-types, adopted into it (R107): the PR chip, the Proposed change
  // box, a Decisions item, and a second pull request waiting in Triage.
  if (query.get('specpr')) {
    const fixture = reviewFixture()
    const draft = query.get('specpr') === 'draft'
    const diff = (lines: string[]) => lines.join('\n')
    const pull = {
      id: 'spec-pr:acme/plans#12',
      spec: 'byte-types',
      planId: 'byte-types',
      title: 'Add overflow wrapping to byte types',
      repository: 'acme/plans',
      number: 12,
      url: 'https://github.com/acme/plans/pull/12',
      author: 'mira',
      draft,
      checks: draft ? 'pending' : 'passing',
      head: 'a1b2c3d4'.repeat(5),
      hash: fixture.data.revisionHash,
      link: 'own',
      newSpec: false,
      files: [
        {
          file: 'requirements.md',
          status: 'changed',
          added: 2,
          removed: 1,
          diff: diff([
            '@@ -4,3 +4,4 @@',
            ' 2. A byte SHALL hold 0 to 255.',
            '-3. Arithmetic SHALL not overflow.',
            '+3. Arithmetic SHALL wrap modulo 256.',
            '+4. A test SHALL show 255 + 1 wraps to 0.',
          ]),
        },
        { file: 'tasks.md', status: 'changed', added: 1, removed: 0, diff: diff(['@@ -6,2 +6,3 @@', ' - [ ] 1.2 Add byte strings', '+- [ ] 1.3 Test overflow wraps']) },
      ],
      tasks: [{ taskId: '1.3', title: 'Test overflow wraps', change: 'added' }],
      review: {
        state: 'done',
        current: true,
        found: 4,
        bySeverity: { blocker: 1, warn: 2, info: 1 },
        openBySeverity: { blocker: 1, warn: 2, info: 0 },
        summary: 'Makes byte arithmetic wrap and adds one test task.',
      },
      approved: false,
      merging: false,
      canApprove: !draft,
    }
    items[0] = { ...items[0], pull: { number: 12, draft } }
    answer('specpr.view', () => ({ items: [pull] }))
    answer('plan.approve', () => ({
      id: 'byte-types',
      hash: pull.hash,
      pending: true,
      approvalPullRequest: { repository: 'acme/plans', number: 12, branch: 'spec/byte-types', adopted: true },
    }))
    answer('specpr.reject', () => ({ closed: true }))
    answer('specpr.requestChanges', () => ({ posted: 3 }))
    answer('conflicts.view', () => ({
      revision: 1,
      items: [
        {
          id: 'spec-pull:spec-pr:acme/plans#12',
          kind: 'spec-pull',
          taskId: null,
          plan: 'byte-types',
          title: 'Proposed change to byte-types: Add overflow wrapping to byte types',
          detail: draft
            ? 'A draft pull request. Read it now; approving waits until it is marked ready.'
            : 'Read the change and the review, then approve, request changes or reject.',
          link: pull.url,
          specPull: pull,
        },
      ],
    }))
    const row = (number: number, title: string, extra = {}) => ({
      kind: 'pr',
      number,
      title,
      url: `https://github.com/acme/plans/pull/${number}`,
      repository: 'acme/plans',
      author: 'dave',
      createdAt: '2026-11-17T09:00:00Z',
      labels: [],
      comments: 0,
      draft: true,
      checks: 'passing',
      source: 'github',
      id: `acme/plans#${number}`,
      links: { github: `https://github.com/acme/plans/pull/${number}`, review: { tooltip: 'Opens a Kiro Crew chat that reviews it.' } },
      ...extra,
    })
    answer('specpr.adopt', () => ({ id: 'spec-pr:acme/plans#14', spec: 'export-formats' }))
  }
  const writes: Record<string, number> = { 'byte-types': 14, compression: 21, 'nupp-native-runtime-winddown-2026-11-11': 268 }
  answer('plan.approvalBatches', (body) => {
    const ids = (body.input as { ids?: string[] } | undefined)?.ids
    if (!ids) return { batches }
    const specs = batches
      .flatMap((b) => b.specs)
      .filter((e) => ids.includes(e.id))
      .map((e) => ({ ...e, writes: writes[e.id] ?? 3 }))
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
if (query.get('epics') === 'empty') {
  answer('epics.view', () => ({ epics: [], unprojected: [] }))
}
if (query.get('epics') === 'full') {
  const phase = (id: string, title: string, gate: string, total: number, merged: number, released: number, held: string | null) => ({
    id,
    title,
    gate,
    total,
    merged,
    released,
    held,
  })
  answer('epics.view', () => ({
    epics: [
      {
        id: 'search-v2',
        title: 'Search v2',
        tasks: 12,
        merged: 5,
        running: 1,
        plans: [
          {
            id: 'search-v2',
            title: 'Plan v3',
            state: 'approved',
            phases: [
              phase('p1', 'Index', 'passed', 3, 3, 3, null),
              phase('p2', 'Ranking', 'open', 4, 0, 1, '3 wait on #52 (CI)'),
              phase('p3', 'Cache', 'closed', 5, 0, 0, 'Phase Ranking waits for phase Index to merge.'),
            ],
          },
          { id: 'search-docs', title: 'Docs', state: 'approved', phases: [phase('d1', 'Write', 'open', 1, 0, 0, null)] },
        ],
      },
    ],
    unprojected: [{ id: 'notes', title: 'Notes export', state: 'draft', tasks: 4, reason: 'Draft spec. Not approved. Approve it in the Spec Builder chat or its side panel.' }],
  }))
}
const page = query.get('page')
// ?page=needs: Needs you's list column with four open items, for the filter
// row and the count shown once.
if (page === 'needs') {
  const it = (n: number, kind: string) => ({
    key: `k${n}`,
    kind,
    taskId: `t${n}`,
    title: `Item ${n}`,
    detail: 'Waits on you.',
    plan: 'meal-planner',
    epic: null,
    repository: 'example/recipe-box',
    since: '2026-11-14T10:00:00Z',
  })
  answer('conflicts.view', () => ({
    revision: 1,
    items:
      query.get('draftReview') === '1'
        ? [
            {
              id: 'draft-review-1',
              kind: 'plan-review',
              taskId: null,
              plan: 'reader',
              title: 'Review draft reader?',
              detail: 'Read this draft on a different model, or skip this revision.',
              planReview: { planId: 'reader', revisionHash: 'a'.repeat(64) },
            },
          ]
        : [it(1, 'decision'), it(2, 'decision'), it(3, 'needs-human'), it(4, 'review')],
  }))
  answer('plan.review.decide', (body) => {
    state.calls.push(body)
    if (query.get('draftDelay') === '1')
      return new Promise((resolve) => {
        window.addEventListener('release-draft-review', () => resolve({ state: (body.input as { action: string }).action }), { once: true })
      })
    return { state: (body.input as { action: string }).action }
  })
  answer('delivery.view', () => ({ revision: 1, items: [] }))
}
function NeedsPage() {
  const [workspaceId, setWorkspaceId] = useState('w')
  return (
    <>
      {query.get('draftReview') === '1' && (
        <button data-review-workspace={workspaceId} onClick={() => setWorkspaceId('other')}>
          Switch workspace
        </button>
      )}
      <ConflictsView workspaceId={workspaceId} />
    </>
  )
}
// ?page=forward[&state=ok|blocked|stopped]: the Forward screen on replies the
// real operations gave in the live scratch run (forward-live-replies.json).
if (page === 'forward') {
  const state = query.get('state') ?? 'ok'
  answer('mirror.forward.review', () =>
    state === 'blocked'
      ? { ok: false, blocked: true, reason: forwardLive.blockedReason }
      : state === 'stopped'
        ? { ok: false, stopped: forwardLive.stopped, review: forwardLive.review }
        : { ok: true, ready: true, review: forwardLive.review },
  )
}
const intake = page === 'intake'
if (intake) answerIntake(query.get('empty') === '1')
// &plugins=many|none: Settings > Plugins with eight plugins, or none.
if (query.get('plugins')) {
  const many = query.get('plugins') === 'many'
  const rows = Array.from({ length: 8 }, (_, i) => ({ ...PLUGINS[i % 2], id: `${PLUGINS[i % 2].id}-${i + 1}` }))
  answer('plugins.list', () => ({ supportedContracts: [1], plugins: many ? rows : [] }))
}
// &rules=many|one: Settings > Content rules with fourteen rule sets, or one.
if (query.get('rules')) {
  const count = query.get('rules') === 'many' ? 14 : 1
  const sets = Array.from({ length: count }, (_, i) => ({
    id: i ? `codenames-${i + 1}` : 'codenames',
    action: i % 3 ? 'block' : 'report',
    source: 'file',
    boundaries: ['plan', 'github'],
    available: true,
    ruleCount: 2,
  }))
  answer('content.rules', () => ({
    error: null,
    configHash: 'h1',
    mode: 'single-repo',
    builtins: [
      { id: 'secrets', appliesAt: 'Every write' },
      { id: 'private-paths', appliesAt: 'Mirror pushes' },
    ],
    choices: { repositories: ['recipe-box'], plugins: [] },
    sets,
  }))
  answer('content.terms.get', (body) => ({
    id: (body.input as { id: string }).id,
    file: '~/.avoozl/codenames.terms',
    from: 'machine',
    editable: true,
    exists: true,
    text: 'zebra: zebra falcon\nheron: blue heron\n',
  }))
}

// ?page=panel&sid=<chat>&state=full|empty: the side panel on sample reads.
// window.__panel holds what the reads return, so a test can change it and see
// the panel read again; window.__panelReads counts the reads and
// window.__panelCalls records writes.
type PanelData = { conflicts: unknown[]; remote: unknown[]; queue: unknown[]; tasks: unknown[]; line: unknown[]; specs: unknown[]; fail?: string }
const panelWin = window as unknown as { __panel: PanelData; __panelReads: number; __panelCalls: unknown[] }
const panelRow = (taskId: string, state: string, reason: string) => ({
  taskId,
  title: `Task ${taskId}`,
  planId: 'search-v2',
  spec: 'search-v2',
  phase: 'one',
  scope: null,
  label: 'ready',
  number: null,
  url: null,
  manual: false,
  state,
  reason,
  used: 0,
  capacity: 2,
})
if (page === 'panel') {
  const full = query.get('state') !== 'empty'
  panelWin.__panelReads = 0
  panelWin.__panelCalls = []
  panelWin.__panel = {
    conflicts: full
      ? [
          {
            kind: 'needs-human',
            reason: 'crew',
            taskId: null,
            title: '#52 asks about the tokenizer',
            detail: 'Tokenizer A or B? The agent is waiting for an answer.',
            link: 'https://github.test/acme/recipe-box/issues/52',
          },
          { kind: 'stale-session', taskId: 'S9', title: 'A retired worker row', detail: 'must not show' },
        ]
      : [],
    remote: full
      ? [
          {
            host: 'box',
            crewId: 'r1',
            taskId: 'S5',
            state: 'running',
            chatKey: 'k',
            status: 'working',
            updatedAt: new Date().toISOString(),
            attachUrl: 'https://box.test/chat?sid=k',
            stale: false,
            lastOkAt: null,
          },
        ]
      : [],
    queue: full ? [panelRow('S9', 'next', 'Waits on #52, then it is next.'), panelRow('S10', 'held', 'Held by the line.')] : [],
    tasks: full ? [{ taskId: 'S4', title: 'Tokenizer', repository: 'acme/recipe-box', finishedAt: new Date(Date.now() - 3600000).toISOString() }] : [],
    line: [],
    specs: [
      {
        name: 'search-v2',
        folder: '.kiro/specs/search-v2',
        type: 'feature',
        hash: 'h',
        files: ['requirements.md', 'design.md', 'tasks.md'],
        counts: { error: 0, warning: 1 },
        taskCount: 12,
        critique: null,
        plan: { id: 'search-v2', state: 'draft', hash: 'h', revision: 1, changed: false, approved: false },
      },
    ],
  }
  const data = () => {
    if (panelWin.__panel.fail) throw Object.assign(new Error('down'), { status: 500, body: '{"error":"down"}' })
    return panelWin.__panel
  }
  answer('workspaces.list', () => ({ defaultWorkspace: 'w', items: [{ id: 'w', name: 'Harness', root: '/w', enabled: true, state: 'ready', served: true }] }))
  // ?places=1: two workspaces, Avoozl's (/w) and Nupp's (/n, whose code
  // checkout is /src/nupp), and chats whose project folders sit in each.
  if (query.get('places')) {
    answer('workspaces.list', () => ({
      defaultWorkspace: 'w',
      items: [
        { id: 'w', name: 'Avoozl plans', root: '/w', enabled: true, state: 'ready', served: true },
        { id: 'nupp', name: 'Nupp plans with a long name', root: '/n', enabled: true, state: 'ready', served: false },
      ],
    }))
    answer('repositories.list', (body) => ({
      items:
        (body as { workspaceId?: string }).workspaceId === 'nupp'
          ? [{ id: 'nupp', name: 'nupp', localCheckout: '/src/nupp', github: 'o/nupp', baseBranch: 'main' }]
          : [{ id: 'av', name: 'avoozl', localCheckout: '/src/avoozl', github: 'o/avoozl', baseBranch: 'main' }],
    }))
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
    return {
      readAt: new Date().toISOString(),
      conflicts: part(() => data().conflicts),
      remote: part(() => data().remote),
      queue: part(() => ({ repositories: [{ repository: 'acme/recipe-box', ready: 'ready', mode: 'automatic', capacity: 2, scopes: [], steps: [], rows: data().queue }] })),
      flow: part(() => ({ tasks: data().tasks, line: data().line })),
      specs: part(() => data().specs),
      instance: { id: 'inst-1', name: 'Kelp' },
    }
  })
  // The line, read by the pause button: ?stopped=1 opens a stop; Resume closes it.
  let panelStops = query.get('stopped') ? [{ id: 'l1', manual: true, reason: 'bad base', scope: 'all', closedAt: null, branch: 'main', check: null }] : []
  answer('flow.view', () => ({ line: panelStops, stages: [], tasks: [], retros: [] }))
  answer(
    'flow.resume',
    (body) => (panelWin.__panelCalls.push({ resume: (body.input as { stopId?: string }).stopId }), (panelStops = []), { stop: { id: 'l1', closedAt: new Date().toISOString() } }),
  )
  answer('GET /api/apps/spec-builder/specs', () => ({ specs: [{ name: 'search-v2' }] }))
}
// ?page=panel&real=1: the panel on the replies a real backend gave over the
// sample workspace (window.__REAL_PANEL, panel-real.test.mjs), so a reply that
// drifts from what the panel reads shows up here and not only in a live host.
const realPanel = (window as unknown as { __REAL_PANEL?: Record<string, unknown> }).__REAL_PANEL
if (page === 'panel' && query.get('real') === '1' && realPanel) {
  answer('panel.view', () => realPanel['panel.view'])
  answer('GET /api/apps/spec-builder/specs', () => ({ specs: ((realPanel['panel.view'] as { specs?: { name: string }[] }).specs ?? []).map((item) => ({ name: item.name })) }))
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
// ?page=crews-rules: the Landing tab's fields on one repository form.
function CrewsRulesPage() {
  const [repository, setRepository] = useState<RepositoryForm>(emptyRepository('example/code'))
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <HarnessBoundary>
        <LandingParts repository={repository} set={(change) => setRepository((before) => ({ ...before, ...change }))} />
        <pre data-form style={{ whiteSpace: 'pre-wrap' }}>
          {JSON.stringify({ maxAttempts: repository.maxAttempts, mergeMethod: repository.mergeMethod })}
        </pre>
      </HarnessBoundary>
    </div>
  )
}
function LandingParts(props: { repository: RepositoryForm; set: (change: Partial<RepositoryForm>) => void }) {
  return (
    <>
      <ConflictFields id="t" {...props} />
      <MergeMethodFields id="t" {...props} />
      <AutoMergeFields id="t" {...props} />
    </>
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
          allowedActors: ['sam', 'lee'],
        },
      },
    },
  },
  plans: {
    mode: 'plans-repo',
    policy: {
      mode: 'plans-repo',
      planningRepository: 'example/plans',
      repositories: { 'example/code': { baseBranch: 'main', minimumPermission: 'maintain' } },
    },
  },
  local: { mode: 'local', policy: { mode: 'local', repositories: { 'example/code': { baseBranch: 'trunk' } } } },
}
function WorkflowMapPage() {
  const config = WORKFLOW_POLICIES[query.get('config') ?? 'single']
  const form = toForm(config.policy as never)
  // ?autoMerge=off: the repository's landing.autoMerge is false.
  const [repository, setRepository] = useState<RepositoryForm>({ ...form.repositories[0], ...(query.get('autoMerge') === 'off' ? { autoMerge: 'off' } : {}) })
  return (
    <div {...{ [APP_ATTR]: '' }} style={{ padding: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', boxSizing: 'border-box' }}>
      <HarnessBoundary>
        <WorkflowMap workspaceId="w" mode={config.mode} repository={repository} planningRepository={form.planningRepository} onJump={(jump) => focusField('t', jump)} />
        <LandingParts repository={repository} set={(change) => setRepository((before) => ({ ...before, ...change }))} />
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
  page === 'needs' ? (
    <NeedsPage />
  ) : page === 'specs' ? (
    <SpecsPage />
  ) : page === 'tip' ? (
    <TipPage />
  ) : page === 'panel' ? (
    <PanelPage />
  ) : page === 'workflow-map' ? (
    <WorkflowMapPage />
  ) : page === 'crews-rules' ? (
    <CrewsRulesPage />
  ) : page === 'forward' ? (
    <ForwardPage />
  ) : intake ? (
    <IntakePage />
  ) : page === 'home' ? (
    <HomePage />
  ) : page === 'activity' ? (
    <ActivityPage />
  ) : page && page !== 'app' && page !== 'demo' ? (
    <SettingsPage name={page} />
  ) : query.get('app') ? (
    <AppPage />
  ) : (
    <Page />
  ),
)

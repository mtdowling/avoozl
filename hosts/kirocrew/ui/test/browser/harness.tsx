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
import { answerSignIn } from './signin-fixture.ts'
import { InFlightRow } from '../../src/InFlight.tsx'
import { NavHistoryProvider, APP_ATTR } from '../../src/NavHistory.tsx'
import { SpecLinkContext } from '../../src/spec-link.ts'
import { ConfirmProvider, DangerBtn, InfoTip } from '../../src/ui/controls.tsx'
import { Tooltip } from '../../src/ui/Tooltip.tsx'
import { TaskDrawerProvider } from '../../src/TaskDrawer.tsx'
import GraphView from '../../src/GraphView.tsx'
import AddPlugin from '../../src/AddPlugin.tsx'
import { Modal } from '../../src/ui/Modal.tsx'
import { specGraph } from './spec-graph-fixture.ts'
import { installInlineFixture } from './settings-inline-fixture.ts'
import PlansView from '../../src/PlansView.tsx'
import { DocumentReader } from '../../src/DocumentReader.tsx'
import { StopLineButton } from '../../src/StopLine.tsx'
import WorkspaceView from '../../src/WorkspaceView.tsx'
import ActivityView from '../../src/ActivityView.tsx'
import { LAYER } from '../../src/layers.ts'
import PluginsSettings from '../../src/PluginsSettings.tsx'
import SettingsView, { RateBlock, RepositoryEditor } from '../../src/SettingsView.tsx'
import type { EditTab } from '../../src/repo-edit-tabs.ts'
import { answerIntake, PLUGINS } from './intake-fixture.ts'
import { chainsGraph, draftsGraph } from './graph-chains.ts'
import { PrModeFields, ConflictFields, MergeMethodFields } from '../../src/LandingFields.tsx'
import { emptyRepository, type RepositoryForm } from '../../src/settings-api.ts'
import AvoozlApp from '../../src/App.tsx'
import { MarkDoneDialog } from '../../src/ManualTask.tsx'
import { needsContextItems } from './needs-context-fixture.ts'
import { useTaskDrawer } from '../../src/drawer-context.ts'
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
})
answer('task.detail', () => baseDetail())
answer('repositories.list', () => ({ items: [{ id: 'sdk', name: 'sdk', localCheckout: '/w/sdk', github: 'o/sdk', baseBranch: 'main' }] }))
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
  'repo-edit': repoEdit(false),
  'repo-edit-unsaved': repoEdit(true),
  confirm: own(
    'Remove',
    <DangerBtn confirm={{ title: 'Remove avoozl?', body: 'Its settings go. The checkout stays.', action: 'Remove' }} onConfirm={() => undefined}>
      Remove
    </DangerBtn>,
  ),
  'file-viewer': shown((close) => <DocumentReader workspaceId="w" target={{ document: 'docs/guide.md', lineStart: null, lineEnd: null }} text={text} onClose={close} />),
  'stop-line': own('Stop the line', <StopLineButton workspaceId="w" onPulled={() => undefined} />),
  'task-drawer': own('Open the dialog', <OpenTask />),
  'review-info': own('Open the dialog', <OpenReview />),
  'mark-done': shown((close) => <MarkDoneDialog workspaceId="w" taskId="team-review" title="Review with team" onClose={close} onDone={close} />),
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
// second one to switch to. &configError=1 gives it a .avoozl.json that does
// not load.
answer('workspaces.list', () => ({
  defaultWorkspace: 'w',
  items: [
    {
      id: 'w',
      name: query.get('long') === '1' ? 'Recipe box planning and the meal planner rewrite' : 'Harness',
      root: '/w',
      enabled: true,
      state: 'ready',
      served: true,
      ...(query.get('configError')
        ? { configError: 'Unknown setting "github.repositories.example/app.role" in repository Avoozl configuration at /w/.avoozl.json. Remove it.' }
        : {}),
    },
    ...(query.get('long') === '1' ? [{ id: 'w2', name: 'Avoozl', root: '/w2', enabled: true, state: 'ready', served: false }] : []),
  ],
}))
// Settings > Workspaces > Telemetry. &telemetry=STATUS picks what the status
// operation says (off by default); a save sets it from what was saved.
let telemetryStatus = query.get('telemetry') ?? 'off'
const exporting = () => !['off', 'no-endpoint'].includes(telemetryStatus)
let telemetrySaved: { endpoint: string | null; protocol: string; headers: string[] } = exporting()
  ? { endpoint: 'https://otlp.example:4318', protocol: 'http/json', headers: ['authorization'] }
  : { endpoint: null, protocol: 'http/json', headers: [] }
const telemetryView = () => ({
  status: telemetryStatus,
  failure: telemetryStatus === 'backing-off' ? 'http 503' : null,
  endpoint: exporting() ? 'https://otlp.example:4318' : null,
  endpointFrom: exporting() ? 'machine' : null,
  protocol: telemetryStatus === 'protocol' ? 'grpc' : 'http/json',
  headerNames: exporting() ? ['authorization'] : [],
  missingHeaders: [],
  saved: telemetrySaved,
  sent: telemetryStatus === 'sending' || telemetryStatus === 'backing-off' ? 41 : 0,
  queued: telemetryStatus === 'backing-off' ? 3 : 0,
  dropped: 0,
  rejected: 0,
  lastSuccessAt: telemetryStatus === 'sending' || telemetryStatus === 'backing-off' ? '2026-11-20T03:12:09.000Z' : null,
  local: { spans: 5120, points: 48210, days: 90, spanCap: 200000, pointCap: 1000000 },
})
answer('telemetry.status', telemetryView)
answer('telemetry.configure', (body) => {
  const input = body.input as { enabled?: boolean; endpoint?: string; headers?: string[] }
  telemetrySaved = { ...telemetrySaved, endpoint: input.endpoint || null, headers: input.headers ?? telemetrySaved.headers }
  telemetryStatus = input.enabled ? (input.endpoint ? 'sending' : 'no-endpoint') : 'off'
  return telemetryView()
})

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

// ?page=home: the Dashboard alone with nothing in flight. &ran=1 gives the
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
  answer('flow.view', () => ({ line: [], stages: [], tasks: [] }))
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
  if (!replyFor('landing.view')) answer('landing.view', () => ({ queue: [], landed: [], landedThisWeek: 0 }))
  // &claims=1: In flight's claim branches and lanes, one of each kind.
  const claimsShown = query.get('claims') === '1'
  answer('claims.view', () => ({
    claims: claimsShown
      ? [
          {
            repository: 'acme/recipe-box',
            branch: 'avoozl/meal-planner/a1',
            spec: 'meal-planner',
            task: 'a1',
            title: 'Task a1',
            holder: 'this runner',
            head: 'a1b2c3d4e5',
            at: '2026-11-14T10:00:00Z',
            ageHours: 2,
            stale: false,
          },
          {
            repository: 'acme/recipe-box',
            branch: 'avoozl/meal-planner/a2',
            spec: 'meal-planner',
            task: 'a2',
            title: 'Task a2',
            holder: 'another runner',
            head: 'f6e5d4c3b2',
            at: '2026-11-13T08:00:00Z',
            ageHours: 30,
            stale: true,
          },
        ]
      : [],
  }))
  answer('lanes.view', () => ({
    lanes: claimsShown
      ? [
          {
            lane: 'worker-1',
            role: 'worker',
            header: 'Worker 1',
            harness: 'kirocrew',
            state: 'busy',
            task: 'a1',
            slot: 'chat-1',
            open: 'Kiro Crew chat "Worker 1" in Avoozl › harness',
          },
          { lane: 'reviewer-1', role: 'reviewer', header: 'Reviewer 1', harness: 'claude', state: 'free', task: null, slot: 'p-2', open: 'avoozl session attach p-2' },
          {
            lane: 'worker-2',
            role: 'worker',
            header: 'Worker 2',
            harness: 'kirocrew',
            state: 'paused',
            task: null,
            slot: null,
            open: 'Resume in Needs you, or avoozl lane resume worker-2',
          },
        ]
      : [],
  }))
  // &home=empty: Home's CI read answers with no runs (only Home reads it).
  if (query.get('home') === 'empty') answer('flow.view', () => ({ line: [], stages: [], tasks: [], flaky: [], ciOnly: [] }))
  // &roles=plans|single|local: Repository setup in each github.mode, the
  // planning repository without a checkout in &roles=plans.
  const roles = query.get('roles')
  const rolesGithub =
    roles === 'single'
      ? { mode: 'single-repo', repositories: { 'acme/recipe-box': { baseBranch: 'main' }, 'acme/recipe-api': { baseBranch: 'main' } } }
      : roles === 'local'
        ? { repositories: { 'acme/recipe-box': { baseBranch: 'main' }, 'acme/recipe-api': { baseBranch: 'main' } } }
        : {
            mode: 'plans-repo',
            planningRepository: 'acme/plans',
            epicIssueType: 'Epic',
            repositories: {
              'acme/recipe-box': {
                baseBranch: 'main',
                requiredChecks: ['test (ubuntu)', 'test (macos)', 'test (windows)'],
                landing: { method: 'squash' },
              },
              'acme/recipe-api': { baseBranch: 'main', minimumPermission: 'write' },
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
  // Add repository reads a folder.
  if (roles) {
    // Save writes are recorded in __harness.calls.
    if (!replyFor('github.settings.update'))
      answer('github.settings.update', (body) => {
        state.calls.push(body)
        return replyFor('github.settings.get')!({})
      })
    answer('repositories.detect', (body) => {
      const folder = (body.input as { folder: string }).folder
      const plans = /plans/.test(folder)
      return {
        root: folder.replace(/^~/, '/home-folder'),
        id: plans ? 'team-plans' : 'new-service',
        baseBranch: 'main',
        remote: 'origin',
        github: plans ? 'acme/team-plans' : 'acme/new-service',
      }
    })
    answer('repositories.configure', (body) => ({
      id: (body.input as { id: string }).id,
      name: (body.input as { id: string }).id,
      localCheckout: (body.input as { localCheckout: string }).localCheckout,
      github: 'acme/new-service',
      baseBranch: 'main',
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
    stages: [],
    repositories: ['acme/recipe-box', 'acme/docs'],
    epics: [],
    series: { day: [], week: [] },
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
// &autopilotoff=1: ready tasks wait because this machine has no loop.
if (query.get('page') === 'app' && query.get('autopilotoff') === '1')
  answer('conflicts.view', () => ({
    revision: 1,
    items: [
      {
        kind: 'needs-human',
        reason: 'autopilot-off',
        id: 'autopilot-off',
        taskId: null,
        title: 'Autopilot is off on this machine, so ready tasks wait.',
        detail: 'Turn it on in Settings › Autopilot, or run avoozl next --claim.',
      },
    ],
  }))
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
  answer('flow.view', () => ({ line: stops, stages: [], tasks: [] }))
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
// A running task of the Meal planner spec, and that spec's graph, for the
// In flight scenarios (&links=1, &direct=1).
const meal = (id: string, title: string) => ({
  ...task(id, 'e1'),
  title,
  planId: 'meal-planner',
  spec: 'meal-planner',
  repository: 'recipe-box',
  phase: null,
  state: 'running',
  status: 'running',
})
const mealPlannerGraph = (tasks: unknown[]) => ({
  revision: 1,
  epics: [{ id: 'e1', title: 'Meal planner', count: tasks.length }],
  plans: [{ id: 'meal-planner', title: 'Meal planner' }],
  statuses: [
    { id: 'planned', label: 'Planned', complete: false },
    { id: 'done', label: 'Done', complete: true },
  ],
  repositories: ['recipe-box'],
  total: tasks.length,
  tasks,
  edges: [],
})
// &links=1: Home's In flight with PR and branch chips (task 44.4): checks
// pass, running, fail and stale, a long branch name, and a row with a branch
// but no pull request. Repositories and numbers are made up.
if (query.get('page') === 'app' && query.get('links') === '1') {
  const at = new Date(Date.now() - 9 * 60000).toISOString()
  const rows: [string, string, string, string, number | null, string | null][] = [
    ['m3', 'Sync pantry items between devices', 'worker', 'avoozl/meal-planner/m3-sync-pantry-items-between-devices', 412, 'pass'],
    ['s1', 'Index recipes by ingredient', 'reviewer', 'avoozl/s1', 415, 'pending'],
    ['s3', 'Show prep time on each card', 'checks', 'avoozl/s3-prep-time', 418, 'fail'],
    ['s4', 'Keep the shopping list in sync', 'worker', 'avoozl/s4-list-sync', 420, 'stale'],
    ['s5', 'Add a print view for one recipe', 'worker', 'avoozl/s5-print-view', null, null],
  ]
  answer('graph.view', () => mealPlannerGraph(rows.map(([id, title]) => meal(id, title))))
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
// ?page=app&direct=1: direct links (spec direct-links). In flight holds a
// local chat, a Remote Crew chat, a crew that does not answer, a `process`
// worker's log and a start not bound yet. Needs you answers a notice's link: &decision=LinkedDecision01
// opens task m3's decision; any other ID is closed. &hide=1 saves a filter
// that hides it. Names and numbers are made up.
if (query.get('page') === 'app' && query.get('direct') === '1') {
  const at = new Date(Date.now() - 12 * 60000).toISOString()
  const rows: [string, string][] = [
    ['m3', 'Sync pantry items between devices'],
    ['s1', 'Index recipes by ingredient'],
    ['s3', 'Show prep time on each card'],
    ['s4', 'Keep the shopping list in sync'],
    ['s5', 'Add a print view for one recipe'],
  ]
  answer('graph.view', () => mealPlannerGraph(rows.map(([id, title]) => meal(id, title))))
  const chat = (slot: string, extra = {}) => ({
    slot,
    role: 'worker',
    attempt: 1,
    title: null,
    status: 'working',
    statusAt: at,
    boundAt: at,
    agent: 'kirocrew-worker',
    model: 'claude-sonnet',
    crew: 'local',
    executor: 'kirocrew',
    link: `/chat?sid=${slot}`,
    open: { action: 'chat', label: 'Open worker chat', href: `/chat?sid=${slot}`, machine: 'this machine' },
    ...extra,
  })
  const item = (id: string, sessions: unknown[], extra = {}) => ({
    id,
    title: rows.find((row) => row[0] === id)![1],
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
    sessions,
    ...extra,
  })
  answer('delivery.view', () => ({
    revision: 1,
    items: [
      item('m3', [
        chat('avoozl_m3_1', { attempt: 1, status: 'closed', open: { action: 'chat', label: 'Open ended worker chat', href: '/chat?sid=avoozl_m3_1', machine: 'this machine' } }),
        chat('avoozl_m3_2', { attempt: 2 }),
      ]),
      item('s1', [
        chat('avoozl_s1', {
          crew: 'dev-desktop',
          link: null,
          open: { action: 'chat', label: 'Open worker chat', href: '/chat?crew=dev-desktop&crewSid=avoozl_s1', machine: 'dev-desktop' },
        }),
      ]),
      item('s3', [
        chat('avoozl_s3', {
          crew: 'build-box',
          link: null,
          crewUnreachable: true,
          open: {
            action: 'connect',
            label: 'Connect build-box',
            href: '/settings/instances',
            machine: 'build-box',
            note: 'build-box does not answer. Connect it in Kiro Crew Settings › Instances.',
          },
        }),
      ]),
      item('s4', [
        chat('proc-s4', {
          executor: 'process',
          link: null,
          process: { harness: 'claude-code', state: 'running', exitCode: null, run: 1, logTail: 'Reading src/sync.ts\nRunning npm test', cost: 0.42, attach: null },
          open: { action: 'log', label: 'View worker log', href: null, machine: 'this machine' },
        }),
      ]),
      item('s5', [], { starting: true }),
    ],
    contentReports: [],
  }))
  const decision = (taskId: string, title: string, extra = {}) => ({
    kind: 'decision',
    taskId,
    title,
    detail: 'Pick the sync conflict rule.',
    authority: 'local',
    openedAt: at,
    ...extra,
  })
  answer('conflicts.view', (body) => {
    const asked = (body.input as { decision?: string } | undefined)?.decision
    const linked = asked === 'LinkedDecision01'
    return {
      revision: 1,
      items: [decision('m3', 'Sync pantry items between devices', linked ? { linked: true } : {}), decision('s1', 'Index recipes by ingredient')],
      ...(asked ? { target: linked ? { state: 'open' } : { state: 'closed', taskId: 'm3', newer: true } } : {}),
    }
  })
  if (query.get('hide') === '1') localStorage.setItem('avoozl.conflict-filters.w', JSON.stringify({ q: 'Index' }))
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
  const noMetrics = { tasks: 0, leadTimeMs: null, flowEfficiency: null, firstPassRate: null, changeFailureRate: null, integrationsPerDay: null, timeToFixMs: null }
  answer('radar.releasequeue', () => ({ repositories: [] }))
}
// ?page=app&flow=1: Flow and Settings ›
// Flow, for the owner-rule screenshots (flow-rules-shots.mjs).
if (query.get('page') === 'app' && query.get('flow') === '1') {
  const metrics = { tasks: 1, leadTimeMs: 52 * 60000, flowEfficiency: 0.62, firstPassRate: 1, changeFailureRate: 0, integrationsPerDay: null, timeToFixMs: null }
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
    stages: [],
    repositories: ['acme/recipe-box'],
    epics: [],
    plans: [],
    phases: [],
    series: { day: [], week: [] },
  }))
  answer('flow.settings.get', () => ({
    filename: '.avoozl.json',
    exists: true,
    hash: 'h',
    flow: {},
    repositories: {},
  }))
}
// ?page=app&flowtasks=1: Flow with three tasks in two repositories and two
// specs, whose read follows the repository, spec and stage it is asked for
// (the Flow nav filters test).
if (query.get('page') === 'app' && query.get('flowtasks') === '1') {
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
      firstPass: true,
    }
  }
  const all = [
    mk('search.3', 'Index builder', 'acme/recipe-box', 'search', '15', { queued: 4 * min, coding: 30 * min, tests: 8 * min, 'ci-wait': 10 * min }),
    mk('search.4', 'Ranking', 'acme/recipe-box', 'search', '16', { queued: 2 * min, coding: 12 * min, 'ci-wait': 40 * min }),
    mk('pantry.1', 'Shelf list', 'acme/pantry', 'pantry', '14', { queued: 6 * min, coding: 20 * min, review: 15 * min }),
  ]
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
      stages: ['queued', 'coding', 'tests', 'ci-wait', 'review'],
      repositories: ['acme/pantry', 'acme/recipe-box'],
      epics: [],
      plans: [
        { id: 'pantry', title: 'Pantry' },
        { id: 'search', title: 'Search' },
      ],
      phases: [],
      series: { day: tasks.map(point), week: tasks.map(point) },
    }
  })
  answer('flow.settings.get', () => ({ filename: '.avoozl.json', exists: true, hash: 'h', flow: {}, repositories: {} }))
}
// ?page=demo: the whole page on the made-up sample workspace. Its calls
// answer from window.__DEMO (demo-replies.mjs, built from the sample in
// src/app/test/demo-fixture.mjs); other calls answer as ?page=app does.
const demo = (window as unknown as { __DEMO?: { replies: Record<string, unknown>; previews: Record<string, string> } }).__DEMO
if (query.get('page') === 'demo' && demo) {
  answer('workspaces.list', () => ({ defaultWorkspace: 'sample', items: [{ id: 'sample', name: 'Recipe Box', served: true }] }))
  const names = new Set([...Object.keys(demo.replies), ...Object.keys(demo.previews)])
  for (const name of names) {
    const before = replyFor(name)
    answer(name, (body) => {
      const call = body as { workspaceId?: string }
      if (call.workspaceId === 'sample') {
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
    roles: { checkDecide: { model: 'fake-writer' } } as Record<string, Record<string, string>>,
    harnessDefinitions: [
      { name: 'claude-code', approved: true, model: true, readRoles: null, proved: ['read', 'write'] },
      {
        name: 'codex',
        approved: false,
        model: false,
        readRoles: 'codex names no resultAllow, so a read-only session cannot write its result file.',
        proved: ['write'],
        startProblem: 'codex is not on the PATH of this machine\u2019s server.',
      },
    ],
  }
  answer('GET /api/models', () => ['fake-writer', 'fake-reviewer'])
  answer('models.settings.get', () => settings)
  answer('harness.approve', (body) => {
    const { name } = body.input as { name: string }
    settings = { ...settings, harnessDefinitions: settings.harnessDefinitions.map((d) => (d.name === name ? { ...d, approved: true } : d)) }
    return { name, path: `/config/harnesses/${name}.json`, hash: 'a'.repeat(64) }
  })
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
        // A long login and a large count, so the tests see both tables keep one column grid.
        byLogin: {
          mtdowling: { calls: 12480, notModified: 3021, cached: 118204 },
          'avoozl-machine-server-dev-desktop-review-bot': { calls: 7, notModified: 0, cached: 0 },
        },
      }}
    />
  ),
  'repo-mode': () => <RepoModePage />,
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
  const all: Array<Record<string, any>> = [
    tickRow(27, 2, 'tick.recovered', 'Tick works again after 5 failures'),
    tickRow(26, 1.5, 'tick.failed', 'Tick failed 5 times in a row: database is locked'),
    tickRow(25, 0.5, 'tick.stalled', 'Tick had not run for 42 min; it is running again'),
    ...base,
  ]
  sources.push('tick')
  kinds.push('tick.failed', 'tick.recovered', 'tick.stalled')
  // Rows of each GitHub kind, in a workspace whose repository is on GitHub.
  const repositories = query.get('ghall') === '1' ? ['nupp-lang/foo'] : query.get('ghitems') === '1' ? ['nupp-lang/foo', 'nupp-lang/bar'] : []
  if (query.get('ghall') === '1') {
    const row = (seq: number, source: string, actor: string | null, kind: string, summary: string, extra = {}) => ({
      ...tickRow(seq, 3 + (40 - seq) * -0.1, kind, summary),
      source,
      actor,
      repository: 'nupp-lang/foo',
      ...extra,
    })
    all.unshift(
      row(40, 'tick', 'avoozl', 'task.landed', 'a1 landed at 0123456789ab after 2 tries', { targetId: 'a1', task: true }),
      row(39, 'tick', null, 'task.ticked', 'a2 is done: ticked in tasks.md on avoozl/recipes/a2 at 89abcde', { targetId: 'a2', task: true }),
      row(38, 'tick', 'mira@example.com', 'plan.approved', 'recipes approved by mira@example.com in commit 0123456789ab on rewrite-v3'),
      row(37, 'github', 'octo-reviewer', 'github.check', 'Check test failed on pull request #12'),
      row(36, 'github', 'octo-reviewer', 'github.close', "octo-reviewer closed a3's issue without merged code (completed); dependents released", {
        targetId: 'a3',
        task: true,
        link: 'https://github.com/nupp-lang/foo/issues/31',
      }),
      row(35, 'github', null, 'github.pr-merged', 'Closing pull request merged for a4', { targetId: 'a4', link: 'https://github.com/nupp-lang/foo/pull/22' }),
      row(34, 'github', null, 'intake.item', 'New pr nupp-lang/foo#12 from github'),
      row(33, 'github', 'gh', 'github.token', 'New GitHub token from gh on github.com for land on nupp-lang/foo: signed in as mira, full access, no expiry.'),
      row(32, 'github', 'octo-reviewer', 'github.handback', 'Crew Nova handed back issue #6: it needs a person'),
    )
  }
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
      repositories,
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

// ?page=specs: the Specs tab alone.
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
  answer('plan.table', () => ({ root: '/repo', problem: null, specs: [], revision: 7, items }))
  // &stored=1: byte-types is a stored draft with three files.
  if (query.get('stored') === '1') {
    const hash = 'c0ffee12'.repeat(8)
    const files: Record<string, string> = {
      'requirements.md': [
        '# Requirements',
        '',
        '## Requirement 1: Byte types',
        '',
        'The runtime SHALL offer fixed-width byte types. They are the base for strings, buffers and the wire codecs, so their range, overflow and conversion rules must hold on every target the runtime builds for, including the small embedded ones.',
        '',
        '1. A byte value SHALL hold 0 to 255.',
        '2. Overflow SHALL wrap.',
        '',
        '## Requirement 2: Byte strings',
        '',
        'A byte string SHALL be a run of bytes with a length. It SHALL know its length without a scan, SHALL compare by content, and SHALL hash the same way on every platform, so a byte string read from a file on one machine and written on another keeps its identity. Byte strings are immutable; a builder makes a new one. The builder grows by doubling and never copies more than once per doubling, which keeps appends amortized constant time even for large inputs read in small chunks from a socket or a pipe.',
        '',
        '1. Indexing past the end SHALL fail with an error that names the index.',
        '2. Slicing SHALL copy no bytes.',
        '',
        '## Requirement 3: Encoding',
        '',
        'Text SHALL convert to and from UTF-8 byte strings.',
      ].join('\n'),
      'design.md': ['# Design', '', 'The loader reads `bytes.toml` once at start.', '', '## D1. Layout', '', 'Bytes pack into words of eight.'].join('\n'),
      'tasks.md': ['# Tasks', '', '- [ ] 1.1 Add the byte type [R1.1] (§D1)', '  - A byte holds 0 to 255', '- [ ] 1.2 Wrap on overflow', '  - 256 wraps to 0'].join('\n'),
    }
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
    // window.__moveRevision() stands for the planner writing a revision while
    // an Approve dialog is open.
    const moved = 'd00dfeed'.repeat(8)
    const movedFiles = {
      ...files,
      'requirements.md': files['requirements.md'] + '\n3. A test SHALL show 255 + 1 wraps to 0.',
      'tasks.md': files['tasks.md'] + '\n- [ ] 1.3 Test overflow wraps',
    }
    ;(window as unknown as { __moveRevision: () => void }).__moveRevision = () => {
      at = moved
    }
    answer('graph.view', () => specGraph)
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
    }))
  }
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
    items: [it(1, 'decision'), it(2, 'decision'), it(3, 'needs-human'), it(4, 'review')],
  }))
  answer('delivery.view', () => ({ revision: 1, items: [] }))
}
function NeedsPage() {
  const workspaceId = 'w'
  return query.get('signin') === '1' ? (
    <ConfirmProvider>
      <ConflictsView workspaceId={workspaceId} />
    </ConfirmProvider>
  ) : (
    <ConflictsView workspaceId={workspaceId} />
  )
}
const intake = page === 'intake'
if (intake) answerIntake(query.get('empty') === '1')
// &plugins=many|none: Settings > Plugins with eight plugins, or none.
if (query.get('plugins') && query.get('plugins') !== 'updates') {
  const many = query.get('plugins') === 'many'
  const rows = Array.from({ length: 8 }, (_, i) => ({ ...PLUGINS[i % 2], id: `${PLUGINS[i % 2].id}-${i + 1}` }))
  answer('plugins.list', () => ({ supportedContracts: [1], plugins: many ? rows : [] }))
}
// &plugins=updates: Settings > Plugins after the daily update check found a
// newer tag, a moved branch, and one source it couldn't reach.
if (query.get('plugins') === 'updates') {
  const at = new Date(Date.now() - 2 * 3600_000).toISOString()
  const git = (id: string, ref: string, commit: string, update: Record<string, unknown>) => ({
    ...PLUGINS[0],
    id,
    git: { url: `https://git.example.com/team/${id}.git`, ref },
    commit,
    version: ref.startsWith('v') ? ref.slice(1) : '1.4.0',
    location: `~/.config/avoozl/plugins/git/${id}/${commit}`,
    health: { state: 'ok', reason: null },
    update: { checkedAt: at, ...update },
  })
  answer('plugins.list', () => ({
    supportedContracts: [1],
    updateChecks: { enabled: true },
    plugins: [
      git('team-rules', 'v1.0.0', '4f1c2e9a7b3d5f60812a4c6e8b0d2f4a6c8e0b1d', { state: 'newer', kind: 'tag', current: 'v1.0.0', latest: 'v1.2.0' }),
      git('team-checks', 'main', '9a8b7c6d5e4f30211a2b3c4d5e6f708192a3b4c5', {
        state: 'newer',
        kind: 'commit',
        current: '9a8b7c6d5e4f30211a2b3c4d5e6f708192a3b4c5',
        latest: 'abc1234f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b',
      }),
      git('team-context', 'v2.1.0', '1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e', { state: 'failed', reason: 'git ls-remote failed: Could not resolve host: git.example.com' }),
    ],
  }))
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
    builtins: [{ id: 'secrets', appliesAt: 'Every write' }],
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

class HarnessBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: unknown) {
    return { error: String((error as Error)?.stack ?? error) }
  }
  render() {
    return this.state.error ? <pre data-harness-crash>{this.state.error}</pre> : this.props.children
  }
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
      <PrModeFields id="t" {...props} />
    </>
  )
}
// &epiccontext=1: two tasks whose last session got epic context, and Settings ›
// Epic context with the machine block, a plugin part and the last sessions
// (epic-context ec-2.7).
if (query.get('page') === 'app' && query.get('epiccontext') === '1') {
  const graph = replyFor('graph.view')?.({}) as { tasks: Record<string, unknown>[] }
  const items = 'skill module-layout, read team-notes, mcp research'
  answer('graph.view', () => ({
    ...graph,
    tasks: graph.tasks.map((entry, at) =>
      at === 0
        ? { ...entry, epicContext: { label: 'Epic context', sources: ['team-context'], items } }
        : at === 1
          ? { ...entry, epicContext: { label: 'Epic context (brief only)', sources: ['team-context'], items: 'skill module-layout, read team-notes' } }
          : entry,
    ),
  }))
  const part = {
    repos: ['acme/*'],
    skills: [
      { name: 'error-messages', description: 'How the team words an error: what failed, why, and the next step.', hash: 'a'.repeat(64) },
      { name: 'module-layout', description: 'How the team lays out a module: one folder, an index file, tests beside the code.', hash: 'b'.repeat(64) },
    ],
    reads: [{ id: 'team-notes', about: "The team's design notes", written: '{ask:notesRoot}/widgets', filled: '/srv/acme/team-notes/widgets' }],
    ask: [{ name: 'notesRoot', question: 'The folder of your clone of acme/team-notes', answer: '/srv/acme/team-notes' }],
    servers: [
      {
        alias: 'research',
        about: "Answers questions from the team's design archive",
        command: ['node', '/opt/acme/team-context/mcp/research.mjs'],
        env: ['RESEARCH_TOKEN'],
        replaced: false,
        mapped: true,
      },
    ],
    contentSets: ['acme-terms'],
    ignored: null,
    state: 'approved',
    missing: { questions: [], aliases: [] },
  }
  const tests = (why: string | null) => [
    { name: 'approved', passed: true },
    { name: 'approver', passed: true },
    why ? { name: 'you-drive', passed: false, why } : { name: 'you-drive', passed: true },
  ]
  // &epicmachine=none: this machine has no context of its own yet. A save
  // is kept and recorded in window.__contextWrites; a folder whose path holds
  // "missing" is refused as the backend refuses a folder that is not there.
  let machine: unknown =
    query.get('epicmachine') === 'none'
      ? null
      : {
          repos: ['acme/*'],
          reads: ['~/notes/acme-widgets'],
          mcp: { docs: { about: 'The docs host', command: ['docs-mcp', '--stdio'], env: ['DOCS_TOKEN'] } },
          contentSets: ['acme-terms'],
        }
  const contextWrites: unknown[] = ((window as unknown as { __contextWrites: unknown[] }).__contextWrites = [])
  answer('context.machine.set', (body) => {
    const value = (body as { input: { epicContext: { reads?: string[] } | null } }).input.epicContext
    const at = value?.reads?.findIndex((read) => read.includes('missing')) ?? -1
    if (value && at >= 0) throw new Error(`epicContext.reads.${at} ${value.reads![at]} is not a folder on this machine.`)
    contextWrites.push(value)
    machine = value
    return { epicContext: value }
  })
  answer('content.rules', () => ({
    error: null,
    configHash: 'h1',
    mode: 'single-repo',
    builtins: [],
    sets: ['acme-terms', 'team-words'].map((id) => ({ id, action: 'block', source: 'file', boundaries: null, repositories: null, plugin: null, available: true })),
  }))
  answer('context.get', () => ({
    machine,
    plugins: [{ id: 'team-context', version: '1.0.0', ...part }],
    sessions: [
      {
        at: '2026-11-20T09:12:00Z',
        taskId: 'config.1.1',
        resumed: false,
        briefOnly: false,
        given: true,
        tests: tests(null),
        sources: ['team-context'],
        items,
        left: [{ item: 'read old-notes', why: 'the folder is missing' }],
      },
      {
        at: '2026-11-20T08:40:00Z',
        taskId: 'config.1.2',
        resumed: false,
        briefOnly: false,
        given: false,
        tests: tests('Taken by octo-dev: its spec issue is assigned to them.'),
        sources: [],
        items: '',
        left: [],
      },
    ],
  }))
  answer('plugins.list', () => ({
    supportedContracts: [1],
    plugins: [
      {
        id: 'team-context',
        source: 'machine',
        state: 'approved',
        version: '1.0.0',
        contract: 1,
        provides: ['context'],
        kinds: [],
        hash: 'c'.repeat(64),
        approval: { version: '1.0.0', hash: 'c'.repeat(64), approvedAt: '2026-11-20T08:00:00Z' },
        config: {},
        health: null,
        context: part,
      },
    ],
  }))
}
// &signin=1: the GitHub sign-in screens (signin-fixture.ts).
if (query.get('signin') === '1') answerSignIn(page)
createRoot(document.getElementById('root')!).render(
  page === 'needs' ? (
    <NeedsPage />
  ) : page === 'specs' ? (
    <SpecsPage />
  ) : page === 'tip' ? (
    <TipPage />
  ) : page === 'crews-rules' ? (
    <CrewsRulesPage />
  ) : intake ? (
    <IntakePage />
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

// The modal harness page: one Avoozl modal at a time (?modal=<name>) on a
// page shaped like the host's. A fixed host header with a high z-index, a
// scroll pane with a transform (a containing block), a sticky column, the
// real Graph, and the modal's opener inside a card that is also a
// containing block. ?theme=light|dark sets the host theme attribute.
import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { answer, Btn, Card, Refusal, replyFor } from './stubs.tsx'
import { NavHistoryProvider, APP_ATTR } from '../../src/NavHistory.tsx'
import { ConfirmProvider, DangerBtn } from '../../src/controls.tsx'
import { TaskDrawerProvider } from '../../src/TaskDrawer.tsx'
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
import { CrewDialog } from '../../src/RoutingView.tsx'
import { SwitchModelButton } from '../../src/SwitchModel.tsx'
import ActivityView from '../../src/ActivityView.tsx'
import DashboardView, { InFlightRow } from '../../src/DashboardView.tsx'
import { TaskFiles } from '../../src/TaskFiles.tsx'
import { setupForm } from '../../src/settings-api.ts'
import { LAYER } from '../../src/layers.ts'
import { BudgetSettings } from '../../src/BudgetSettings.tsx'
import PluginsSettings from '../../src/PluginsSettings.tsx'
import { answerIntake } from './intake-fixture.ts'
import AvoozlApp from '../../src/App.tsx'
import { MarkDoneDialog } from '../../src/TaskNotes.tsx'
import NewPlanDrawer from '../../src/NewPlanDrawer.tsx'
import { useTaskDrawer } from '../../src/drawer-context.ts'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const state = ((window as unknown as { __harness: { closed: number } }).__harness = { closed: 0 })

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

const row = { key: 'p1', kind: 'spec', name: 'Modal plan', spec: 'modal-plan', folder: '.kiro/specs/modal-plan', planId: 'modal-plan', type: 'feature', category: null, categoryProblem: null, errors: 0, status: 'approved', tasks: { total: 3, done: 1 }, now: { ready: 1, running: 0, needsYou: 0 }, epics: 1, lastChange: null }
const crew = { id: 'remote-1', name: 'Remote one', tags: ['linux'], trust: 'remote', gitHosts: ['github.com'], chatLimit: 2, chatLimitSet: false, delivery: 'handback', sshHost: null, worktreeRoot: null, configured: true, reading: null, ageSeconds: null, running: 0 }
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
  crew: shown((close) => <CrewDialog crew={crew as never} onCancel={close} onSave={async () => null} />),
  'switch-model': own('Switch model', <SwitchModelButton workspaceId="w" />),
  'task-drawer': own('Open the dialog', <OpenTask />),
  'mark-done': shown((close) => <MarkDoneDialog workspaceId="w" taskId="team-review" title="Review with team" onIssue onClose={close} onDone={close} />),
  // The real page shows New spec over the whole page, not inside a card.
  'new-spec-template': shown((close) => createPortal(<div {...{ [APP_ATTR]: '' }}><NewPlanDrawer workspaceId="w" taken={[]} categories={[]} epics={[{ id: 'sdk-target', title: 'SDK target architecture' }]} start="template" onClose={close} /></div>, document.body)),
  // Not a modal: the drawer's Files fold, at a drawer's width.
  'task-files': shown(() => (
    <div style={{ maxWidth: 620 }}>
      <TaskFiles workspaceId="w" taskId="a1" active />
    </div>
  )),
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
  const names = new Set([...Object.keys(demo.replies), ...Object.keys(demo.previews)])
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
const PAGES: Record<string, () => ReactNode> = {
  budgets: () => <BudgetSettings workspaceId="w" />,
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

const page = query.get('page')
const intake = page === 'intake'
if (intake) answerIntake(query.get('empty') === '1')
createRoot(document.getElementById('root')!).render(
  intake ? <IntakePage /> : page === 'home' ? <HomePage /> : page === 'activity' ? <ActivityPage /> : page && page !== 'app' && page !== 'demo' ? <SettingsPage name={page} /> : query.get('app') ? <AppPage /> : <Page />,
)

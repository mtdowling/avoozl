// The modal harness page: one Avoozl modal at a time (?modal=<name>) on a
// page shaped like the host's. A fixed host header with a high z-index, a
// scroll pane with a transform (a containing block), a sticky column, the
// real Graph, and the modal's opener inside a card that is also a
// containing block. ?theme=light|dark sets the host theme attribute.
import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { answer, Btn, Card } from './stubs.tsx'
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
import { CrewDialog, RuleDialog } from '../../src/RoutingView.tsx'
import { SwitchModelButton } from '../../src/SwitchModel.tsx'
import { setupForm } from '../../src/settings-api.ts'
import { toRuleForm } from '../../src/routing-api.ts'
import { LAYER } from '../../src/layers.ts'

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

// Switch model: two running chats, a health mark, Kiro Crew's models, and a
// dry run whose set grows by one chat after the first Switch, which the
// backend refuses as changed (409). Calls are kept on window.__harness.
const calls = ((window as unknown as { __switch: { previews: unknown[]; switches: unknown[] } }).__switch = { previews: [], switches: [] })
answer('providers.view', () => ({
  settings: {},
  hash: null,
  defaults: { lowPercent: 80, cooldownMinutes: 30, windowHours: 5 },
  marks: [{ id: 'usage:provider:gamma', scope: 'provider', name: 'gamma', level: 'low', source: 'usage', kind: 'usage', percent: 85, since: '' }],
  switches: [],
  chats: [
    { slot: 's1', taskId: 'a1', role: 'worker', model: 'alpha-1', provider: 'alpha', level: 'ok' },
    { slot: 's2', taskId: 'a2', role: 'worker', model: 'alpha-1', provider: 'alpha', level: 'ok' },
  ],
}))
answer('GET /api/models', () => {
  if (query.get('models') === 'fail') throw { status: 502, body: '' }
  return [
    { model_id: 'beta-1', display_name: 'Beta one' },
    { model_id: 'alpha-1', display_name: 'Alpha one' },
  ]
})
const chat = (slot: string, taskId: string, to: string) => ({ slot, taskId, title: `Task ${taskId}`, spec: 'modal-plan', role: 'worker', model: 'alpha-1', to, where: 'local', agent: 'kirocrew-worker' })
answer('provider.switch.preview', (body) => {
  const input = body.input as { to: string; alsoNewTasks?: boolean }
  calls.previews.push(input)
  const grown = calls.switches.length > 0
  const chats = [chat('s1', 'a1', input.to), chat('s2', 'a2', input.to), ...(grown ? [chat('s3', 'a3', input.to)] : [])]
  const skipped = [{ slot: 's9', taskId: 'b1', title: 'Task b1', spec: null, role: 'worker', model: 'alpha-1', to: input.to, where: 'remote-1', agent: null, why: "runs on remote-1; a remote chat's model is not changed from here" }]
  const newTasks = input.alsoNewTasks ? [{ taskId: 'b2', title: 'Task b2', model: 'alpha-1' }] : []
  return { chats, skipped, newTasks, counts: { move: chats.length, stay: 1, newTasks: newTasks.length }, previewHash: grown ? 'h2' : 'h1' }
})
answer('provider.switch', (body) => {
  const input = body.input as { previewHash: string; to: string }
  calls.switches.push(input)
  if (input.previewHash === 'h1') throw { status: 409, body: JSON.stringify({ error: 'The running chats changed since the preview; preview again.' }) }
  return { queued: 3, to: input.to, switches: ['a1', 'a2', 'a3'].map((taskId) => ({ taskId, role: 'worker', from: 'alpha-1', to: input.to })) }
})

const row = { key: 'p1', kind: 'spec', name: 'Modal plan', spec: 'modal-plan', folder: '.kiro/specs/modal-plan', planId: 'modal-plan', type: 'feature', category: null, categoryProblem: null, errors: 0, status: 'approved', tasks: { total: 3, done: 1 }, now: { ready: 1, running: 0, needsYou: 0 }, epics: 1, lastChange: null }
const crew = { id: 'remote-1', name: 'Remote one', tags: ['linux'], trust: 'remote', gitHosts: ['github.com'], chatLimit: 2, chatLimitSet: false, delivery: 'handback', sshHost: null, worktreeRoot: null, configured: true, reading: null, ageSeconds: null, running: 0 }
const text = ['# Guide', '', 'A short file for the viewer.', '', '## Part one', '', 'Some words.', '', '## Part two', '', 'More words.'].join('\n')

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
  rule: shown((close) => <RuleDialog view={{ crews: [], repositories: {}, labels: [] } as never} form={toRuleForm({ id: 'r1' } as never)} isNew={false} models={[]} onCancel={close} onSave={async () => null} onDelete={close} />),
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

function Page() {
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

createRoot(document.getElementById('root')!).render(<Page />)

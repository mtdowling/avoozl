import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import FlowView from '../../src/FlowView.tsx'
import FlowSettings from '../../src/FlowSettings.tsx'
import { NavHistoryProvider, APP_ATTR } from '../../src/NavHistory.tsx'
import { ConfirmProvider } from '../../src/controls.tsx'
import { TaskDrawerProvider } from '../../src/TaskDrawer.tsx'
import { answer } from './stubs.tsx'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') ?? 'light'
const calls = ((window as unknown as { __ciCalls: unknown[] }).__ciCalls = [])
const metrics = { tasks: 0, leadTimeMs: null, flowEfficiency: null, firstPassRate: null, changeFailureRate: null, integrationsPerDay: null, timeToFixMs: null }
const ci = { repositories: query.has('empty') ? [] : [{
  repository: 'example/recipe-box', windowDays: 7, waitShare: 0.55, waitLimit: 0.4, closedPullRequests: 8,
  byClass: { code: { task: { minutes: 45, pullRequests: 2 }, other: { minutes: 15, pullRequests: 1 } }, spec: { task: { minutes: 0, pullRequests: 0 }, other: { minutes: 100, pullRequests: 4 } }, docs: { task: { minutes: 10, pullRequests: 1 }, other: { minutes: 20, pullRequests: 2 } } },
  repeats: [{ workflow: '.github/workflows/test.yml', commits: 2, extraRuns: 3, extraMinutes: 75 }],
}] }
answer('flow.view', () => ({ ci, window: { size: 20, since: null }, metrics, previous: metrics, bottleneck: null, tasks: [], line: [], stops: [], flaky: [], ciOnly: [], retros: [], batches: [], stages: [], repositories: ['example/recipe-box'], epics: [], plans: [], phases: [], planning: [], series: { day: [], week: [] }, usage: { available: false, total: { input: 0, output: 0, credits: 0, turns: 0 }, byTask: [], byPlan: [], byStage: [], byModel: [], byDay: [], byWeek: [], repositories: [] } }))
answer('radar.flow', () => ({ repositories: [] }))
const settings = { filename: '.avoozl.json', exists: true, hash: 'fixture-hash', flow: { ci: { classes: { docs: ['docs/', '**/*.md'] } } }, repositories: {}, instructions: '', retroPrompt: 'Review saved timings and propose one change.', ciClassGlobs: { ci: ['.github/', '.gitlab-ci.yml', '.circleci/'], spec: ['.kiro/specs/'], tests: ['test/', 'tests/', '**/test/**', '**/tests/**', '**/*.test.*', '**/*_test.*'], docs: ['docs/', '**/*.md'], other: ['package-lock.json', '**/package-lock.json', '*.lock', '.gitignore', '.editorconfig'] } }
answer('flow.settings.get', (body) => {
  if (query.get('screen') !== 'settings-workspace') return settings
  if ((body as { workspaceId?: string }).workspaceId === 'second') return { ...settings, flow: { ci: { windowDays: 21, classes: { docs: ['second-guides/'] } } } }
  return new Promise((resolve) => {
    ;(window as unknown as { __finishCiFirst: () => void }).__finishCiFirst = () => resolve({ ...settings, flow: { ci: { windowDays: 3, classes: { docs: ['first-guides/'] } } } })
  })
})
answer('flow.settings.update', (body) => { calls.push(body); return settings })
answer('flow.proposals', () => ({ prompts: [], skills: [], rules: [] }))
function WorkspaceSettings() {
  const [workspace, setWorkspace] = useState('first')
  ;(window as unknown as { __setCiWorkspace: (id: string) => void }).__setCiWorkspace = setWorkspace
  return <FlowSettings workspaceId={workspace} />
}
createRoot(document.getElementById('root')!).render(
  <div {...{ [APP_ATTR]: '' }} data-ci-screenshot style={{ padding: 16, maxWidth: 1080, margin: '0 auto', minHeight: '100vh', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text)' }}>
    <NavHistoryProvider><ConfirmProvider><TaskDrawerProvider workspaceId="fixture" onFocus={() => undefined}>{query.get('screen') === 'settings-workspace' ? <WorkspaceSettings /> : query.get('screen') === 'settings' ? <FlowSettings workspaceId="fixture" /> : <FlowView workspaceId="fixture" />}</TaskDrawerProvider></ConfirmProvider></NavHistoryProvider>
  </div>,
)

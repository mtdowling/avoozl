// Plugin checks on the page (plugin-checks pk-3.1), from fixture records:
// Settings › Plugins' checks part, a task's plugin check results with its
// decide answers, and the phase and branch results.
import { createRoot } from 'react-dom/client'
import { ConfirmProvider } from '../../src/ui/controls.tsx'
import { Card } from '../../src/ui/Card'
import { Stack } from '../../src/ui/Stack'
import StageChecks, { PluginChecksFacts, TaskPluginChecksBox } from '../../src/PluginChecks.tsx'
import { answer } from './stubs.tsx'
import type { PluginChecksPart, TaskPluginChecks } from '../../src/plugin-checks-api.ts'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') ?? 'light'
const calls = ((window as unknown as { __pkCalls: unknown[] }).__pkCalls = [])
for (const operation of ['plugin.map', 'check.decide.flip'])
  answer(operation, (input: unknown) => {
    calls.push({ operation, input })
    return {}
  })

const part: PluginChecksPart = {
  checks: [
    {
      name: 'parity',
      repos: ['acme/*'],
      paths: ['src/api/**', 'schema/**'],
      stage: 'task',
      timeout: 1800,
      step: { kind: 'run', argv: ['bin/parity.mjs', '--repo', '{repo}', '--from', '{base}', '--to', '{commit}'], env: ['PARITY_TOKEN'], network: true },
      decide: {
        file: 'prompts/parity.md',
        at: ['approve', 'diff'],
        text: 'Answer whether this change can alter the public API of the service:\nrequest or response shapes, error codes, or the published schema.\nChanges only to tests, docs, comments or internal helpers do not.\n',
      },
      appliesTo: ['acme/api'],
    },
    {
      name: 'parity-review',
      repos: ['acme/*'],
      paths: ['src/api/**'],
      stage: 'branch',
      timeout: 3600,
      step: {
        kind: 'mcp',
        server: 'review',
        start: { tool: 'create_review', args: { repo: '{repo}', from: '{base}', to: '{commit}', diff: '{diff_path}', question: '{file:ask.md}' }, id: '$.review.id' },
        poll: { tool: 'get_review', args: { id: '{id}' }, everySeconds: 60, until: { path: '$.state', in: ['done', 'error'] } },
        result: { path: '$.verdict', pass: ['same'], text: '$.summary' },
        files: { 'ask.md': 'Does this change alter how the API behaves for a caller? Answer same or\ndiffers, with a one-line summary.\n' },
      },
      decide: null,
      appliesTo: ['acme/api'],
    },
  ],
  shadowed: [{ repository: 'acme/web-shop', name: 'parity' }],
  clashes: [],
  servers: [
    { alias: 'review', about: 'The acme review service, which compares API behavior', mapping: { command: ['/opt/acme/bin/review-mcp', '--stdio'], env: ['REVIEW_TOKEN'] } },
  ],
}
const task: TaskPluginChecks = {
  commit: 'a'.repeat(40),
  results: [
    { name: 'parity', plugin: 'acme-checks', result: 'passed', durationMs: 61000 },
    { name: 'license-scan', plugin: 'acme-checks', result: 'cached', passed: true, firstCommit: 'b'.repeat(40) },
    { name: 'parity-review', plugin: 'acme-checks', result: 'skipped', filter: 'decide', reason: 'Only an internal helper changed.' },
  ],
  decides: [{ check: 'parity-review', plugin: 'acme-checks', at: 'diff', commit: 'a'.repeat(40), state: 'done', needed: false, reason: 'Only an internal helper changed.' }],
}
const stages = {
  phases: {
    'api:p1': {
      run: 'check-run:phase:api:p1:c',
      kind: 'phase' as const,
      title: 'Phase 1: Response fields',
      repository: 'app',
      commit: 'c'.repeat(40),
      state: 'finished',
      checks: [{ name: 'parity', plugin: 'acme-checks', result: 'failed' }],
      skipped: [],
    },
  },
  branches: {
    'acme/api@rewrite/x': {
      run: 'check-run:branch:app@rewrite/x:d',
      kind: 'branch' as const,
      title: 'rewrite/x',
      repository: 'app',
      commit: 'd'.repeat(40),
      state: 'finished',
      checks: [{ name: 'parity-review', plugin: 'acme-checks', result: 'passed' }],
      skipped: [],
    },
  },
}

function Page() {
  return (
    <ConfirmProvider>
      <div data-pk-shot>
        <Stack gap={4}>
          <Card>
            <Stack gap={2}>
              <h3>acme-checks</h3>
              <PluginChecksFacts plugin="acme-checks" part={part} busy={false} act={(fn) => void fn()} workspaceId="w" />
            </Stack>
          </Card>
          <Card>
            <TaskPluginChecksBox workspaceId="w" taskId="a" view={task} />
          </Card>
          <StageChecks workspaceId="w" value={stages} />
        </Stack>
      </div>
    </ConfirmProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Page />)

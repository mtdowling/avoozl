// Provider health and Switch model (design §4.20, R72.12–R72.17): the pure
// helpers and how the Dashboard and Settings wire them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  canUndo,
  fromInput,
  fromOptions,
  markText,
  switchText,
} from '../src/providers-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('From becomes the operation input only when it names something', () => {
  assert.deepEqual(fromInput('provider', ' alpha ', []), { provider: 'alpha' })
  assert.deepEqual(fromInput('model', 'alpha-1', []), { model: 'alpha-1' })
  assert.deepEqual(fromInput('tasks', '', ['t1', 't2']), { tasks: ['t1', 't2'] })
  assert.equal(fromInput('provider', '  ', []), null)
  assert.equal(fromInput('tasks', 'x', []), null)
})

test('From lists the providers, models and tasks the running chats use', () => {
  const chats = [
    { slot: 'a', taskId: 't2', role: 'worker', model: 'beta-1', provider: 'beta', level: 'ok' },
    { slot: 'b', taskId: 't1', role: 'worker', model: 'alpha-1', provider: 'alpha', level: 'out' },
    { slot: 'c', taskId: 't1', role: 'review:x', model: null, provider: null, level: 'ok' },
  ]
  assert.deepEqual(fromOptions(chats), { providers: ['alpha', 'beta'], models: ['alpha-1', 'beta-1'], tasks: ['t1', 't2'] })
})

test('marks read as one line; only a person mark has Undo', () => {
  const person = { id: 'person:provider:alpha', scope: 'provider', name: 'alpha', level: 'out', source: 'person', kind: 'person', to: 'gamma-1', since: '' }
  assert.equal(markText(person), 'Provider alpha is out (a person; new tasks use gamma-1)')
  assert.equal(canUndo(person), true)
  const usage = { id: 'usage:key:alpha-1', scope: 'key', name: 'alpha-1', level: 'low', source: 'usage', kind: 'usage', percent: 85, since: '' }
  assert.equal(markText(usage), 'Limit alpha-1 is low (usage; 85% of its limit)')
  assert.equal(canUndo(usage), false)
  const rate = { id: 'error:model:a', scope: 'model', name: 'a', level: 'low', source: 'error', kind: 'rate-limit', since: '' }
  assert.equal(markText(rate), 'Model a is low (errors; rate limited)')
})

test('switch records say what happened', () => {
  const base = { id: '1', slot: 's', taskId: 't', from: 'a', to: 'b', by: 'auto', at: '' }
  assert.equal(switchText({ ...base, state: 'pending' }), 'a → b: waiting for the next pass')
  assert.equal(switchText({ ...base, state: 'done', result: 'deferred' }), 'a → b at the next turn')
  assert.equal(switchText({ ...base, state: 'done', result: 'refused' }), 'a → b: Kiro Crew refused')
  assert.equal(switchText({ ...base, to: null, state: 'done', result: 'no target' }), 'a: no healthy model to switch to')
})

test('Switch model sits in the Dashboard header and on In flight; providers show in Settings › Routing', () => {
  const dashboard = source('DashboardView.tsx')
  const header = dashboard.slice(dashboard.indexOf('actions={'), dashboard.indexOf('</ViewHeading>'))
  assert.match(header, /<SwitchModelButton workspaceId=\{workspaceId\}/)
  const flight = dashboard.slice(dashboard.indexOf('title={`In flight'), dashboard.indexOf("pages.take('flight'"))
  assert.match(flight, /<SwitchModelButton[\s\S]*tasks=\{/)
  const dialog = source('SwitchModel.tsx')
  // Switch needs a preview first, and sends its hash.
  assert.match(dialog, /disabled=\{busy \|\| !preview/)
  assert.match(dialog, /previewHash: preview\.previewHash/)
  assert.match(dialog, /Also new tasks/)
  assert.match(dialog, /client\.models\(\)/)
  assert.match(source('RoutingView.tsx'), /<ProvidersSection /)
  assert.match(source('views-api.ts'), /'provider-out': 'Provider out'/)
})

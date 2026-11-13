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
  previewDiff,
  switchText,
  toOptions,
  toProvidersForm,
  toProvidersSection,
} from '../src/providers-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('From becomes the operation input only when it names something', () => {
  assert.deepEqual(fromInput('provider', ' alpha ', []), { provider: 'alpha' })
  assert.deepEqual(fromInput('model', 'alpha-1', []), { model: 'alpha-1' })
  assert.deepEqual(fromInput('tasks', '', ['t1', 't2']), { tasks: ['t1', 't2'] })
  assert.equal(fromInput('provider', '  ', []), null)
  assert.equal(fromInput('tasks', 'x', []), null)
})

test('From lists the providers, models and tasks the running chats use, plus health marks', () => {
  const chats = [
    { slot: 'a', taskId: 't2', role: 'worker', model: 'beta-1', provider: 'beta', level: 'ok' },
    { slot: 'b', taskId: 't1', role: 'worker', model: 'alpha-1', provider: 'alpha', level: 'out' },
    { slot: 'c', taskId: 't1', role: 'review:x', model: null, provider: null, level: 'ok' },
  ]
  assert.deepEqual(fromOptions(chats), { providers: ['alpha', 'beta'], models: ['alpha-1', 'beta-1'], tasks: ['t1', 't2'] })
  const marks = [
    { id: 'p', scope: 'provider', name: 'gamma', level: 'low', source: 'usage', kind: 'usage', since: '' },
    { id: 'm', scope: 'model', name: 'delta-1', level: 'out', source: 'error', kind: 'credits', since: '' },
    { id: 'k', scope: 'key', name: 'alpha-1', level: 'low', source: 'usage', kind: 'usage', since: '' },
  ]
  assert.deepEqual(fromOptions(chats, marks), { providers: ['alpha', 'beta', 'gamma'], models: ['alpha-1', 'beta-1', 'delta-1'], tasks: ['t1', 't2'] })
})

test('To offers auto and Kiro Crew models; a changed preview says what moved in and out', () => {
  assert.deepEqual(toOptions([{ value: 'm1', label: 'Model one' }]), [
    { value: 'auto', label: 'auto (Kiro Crew picks)' },
    { value: 'm1', label: 'Model one' },
  ])
  const chat = (slot, model = 'a-1') => ({ slot, taskId: `t-${slot}`, title: null, spec: null, role: 'worker', model, to: 'b-1', where: 'local', agent: null })
  const preview = (chats, newTasks = []) => ({ chats, skipped: [], newTasks, counts: { move: chats.length, stay: 0, newTasks: newTasks.length }, previewHash: 'h' })
  const before = preview([chat('s1'), chat('s2')], [{ taskId: 'q1', title: null, model: 'a-1' }])
  const after = preview([chat('s2'), chat('s3')], [])
  assert.deepEqual(previewDiff(before, after), { added: ['t-s3 worker'], removed: ['t-s1 worker', 'q1 (new task)'] })
  assert.deepEqual(previewDiff(before, before), { added: [], removed: [] })
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

test('the Providers form round-trips and refuses malformed lines', () => {
  const settings = {
    lowPercent: 70,
    cooldownMinutes: 15,
    limits: { claude: { credits: 500 }, 'model-a': { tokens: 2000000 } },
    groups: { anthropic: ['claude-*', 'sonnet-*'] },
    fallback: ['model-b', 'model-c'],
  }
  assert.deepEqual(toProvidersSection(toProvidersForm(settings)).providers, settings)
  assert.deepEqual(toProvidersSection(toProvidersForm()).providers, {})
  const form = toProvidersForm()
  assert.match(toProvidersSection({ ...form, lowPercent: '7.5' }).error, /lowPercent/)
  assert.match(toProvidersSection({ ...form, limits: 'claude dollars 5' }).error, /credits\|tokens/)
  assert.match(toProvidersSection({ ...form, groups: 'anthropic' }).error, /<provider>: <pattern>/)
})

test('Switch model sits in the Dashboard header and on In flight; Providers is a Settings tab', () => {
  const dashboard = source('DashboardView.tsx')
  const header = dashboard.slice(dashboard.indexOf('actions={'), dashboard.indexOf('</ViewHeading>'))
  assert.match(header, /<SwitchModelButton workspaceId=\{workspaceId\}/)
  const flight = dashboard.slice(dashboard.indexOf('title={`In flight'), dashboard.indexOf("pages.take('flight'"))
  assert.match(flight, /<SwitchModelButton[\s\S]*tasks=\{/)
  const dialog = source('SwitchModel.tsx')
  // Dry run, then confirm: Switch needs a preview and sends its hash.
  assert.match(dialog, /disabled=\{busy \|\| !preview/)
  assert.match(dialog, /previewHash: preview\.previewHash/)
  assert.match(dialog, /Also new tasks/)
  assert.match(dialog, /client\.models\(\)/)
  assert.doesNotMatch(dialog, /<datalist/)
  const settings = source('SettingsView.tsx')
  assert.match(settings, /tab === 'providers' \? \(\s*<ProvidersSettings/)
  assert.match(source('views-api.ts'), /'provider-out': 'Provider out'/)
})

// Provider health and Switch model (design §4.20, R72.12–R72.17): the pure
// helpers and how the Dashboard and Settings wire them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  canUndo,
  dryRunDiff,
  emptyLimit,
  fromInput,
  fromOptions,
  markText,
  switchResultText,
  switchText,
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

test('From lists the providers, models and tasks the running chats use', () => {
  const chats = [
    { slot: 'a', taskId: 't2', role: 'worker', model: 'beta-1', provider: 'beta', level: 'ok' },
    { slot: 'b', taskId: 't1', role: 'worker', model: 'alpha-1', provider: 'alpha', level: 'out' },
    { slot: 'c', taskId: 't1', role: 'review:x', model: null, provider: null, level: 'ok' },
  ]
  assert.deepEqual(fromOptions(chats), { providers: ['alpha', 'beta'], models: ['alpha-1', 'beta-1'], tasks: ['t1', 't2'] })
  // The health list adds what it marks; a limit key is left out.
  const marks = [
    { id: 'a', scope: 'provider', name: 'gamma', level: 'out', source: 'error', kind: 'credits', since: '' },
    { id: 'b', scope: 'model', name: 'delta-1', level: 'low', source: 'error', kind: 'rate-limit', since: '' },
    { id: 'c', scope: 'key', name: 'omega', level: 'low', source: 'usage', kind: 'usage', since: '' },
  ]
  assert.deepEqual(fromOptions(chats, marks), { providers: ['alpha', 'beta', 'gamma'], models: ['alpha-1', 'beta-1', 'delta-1'], tasks: ['t1', 't2'] })
})

test('a changed dry run names the chats that joined and left; the result says what moved', () => {
  const chat = (slot, model) => ({ slot, taskId: slot, title: slot, spec: null, role: 'worker', model, to: 'g', where: 'local' })
  const run = (chats, marks = []) => ({ to: 'g', alsoNewTasks: false, chats, skipped: [], marks, queued: [], counts: { switch: chats.length, cannot: 0, queued: 0 }, previewHash: 'h' })
  const diff = dryRunDiff(run([chat('s1', 'a'), chat('s2', 'a')]), run([chat('s2', 'a'), chat('s3', 'a')]))
  assert.deepEqual(diff.added.map((c) => c.slot), ['s3'])
  assert.deepEqual(diff.removed.map((c) => c.slot), ['s1'])
  assert.equal(diff.marks, false)
  assert.equal(dryRunDiff(run([]), run([], [{ scope: 'model', name: 'a', to: 'g' }])).marks, true)
  assert.equal(switchResultText({ queued: 2, marked: ['provider alpha'] }, 'g'), 'Queued 2 running chats to g. Each moves at its next turn. New tasks skip provider alpha until you undo it.')
  assert.equal(switchResultText({ queued: 0 }, 'g'), 'No running chat was moved.')
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

test('the Providers form round-trips and refuses malformed rows', () => {
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
  assert.match(toProvidersSection({ ...form, lowPercent: '7.5' }).error, /Low at must be a whole number/)
  // A blank row is skipped; a half-filled one says what is missing.
  assert.deepEqual(toProvidersSection({ ...form, limits: [emptyLimit()] }).providers, {})
  assert.match(toProvidersSection({ ...form, limits: [{ name: 'claude', unit: 'credits', amount: '' }] }).error, /claude needs an amount/)
  assert.match(toProvidersSection({ ...form, limits: [{ name: '', unit: 'tokens', amount: '5' }] }).error, /needs a provider or model name/)
  assert.match(toProvidersSection({ ...form, groups: 'anthropic' }).error, /<provider>: <pattern>/)
})

test('the Thresholds form groups its fields in titled boxes, shows defaults and folds advanced values away', () => {
  const page = source('ProvidersSettings.tsx')
  for (const title of ['Low and out', 'Limits', 'Fallback models', 'Timing', 'Provider groups']) assert.match(page, new RegExp(`<FieldBox\\s+title="${title}"`), title)
  const advanced = page.slice(page.indexOf('<Fold'), page.indexOf('</Fold>'))
  assert.match(advanced, /avoozl-providers-window/)
  assert.match(advanced, /avoozl-providers-cooldown/)
  assert.match(advanced, /avoozl-providers-groups/)
  assert.doesNotMatch(advanced, /avoozl-providers-low/)
  assert.match(page, /Blank: \$\{d\.lowPercent\}%/)
  assert.match(page, /Add a limit/)
  assert.match(page, /<AskForHelp\s+workspaceId=\{workspaceId\}/)
})

test('Switch model and Stop the line sit once each in the top row; Providers is a Settings tab', () => {
  const app = source('App.tsx'),
    dashboard = source('DashboardView.tsx')
  const row = app.slice(app.indexOf('data-top-row'), app.indexOf('</div>', app.indexOf('data-top-actions')))
  assert.ok(row.indexOf('<SegmentedControl') < row.indexOf('<SwitchModelButton'), 'after the tabs')
  assert.ok(row.indexOf('<SwitchModelButton') < row.indexOf('<StopLineButton'), 'Stop the line goes last')
  for (const file of ['DashboardView.tsx', 'FlowView.tsx', 'DeliveryView.tsx', 'SettingsView.tsx'])
    assert.doesNotMatch(source(file), /<SwitchModelButton|<StopLineButton/, `${file} has its own copy`)
  assert.equal(app.match(/<SwitchModelButton/g).length, 1)
  assert.equal(app.match(/<StopLineButton/g).length, 1)
  assert.match(dashboard, /<LineBanner/)
  const dialog = source('SwitchModel.tsx')
  // Step 1 uses dropdowns and the shared picker, text only when a list can't be read.
  assert.match(dialog, /<select aria-label=\{label\}/)
  assert.match(dialog, /<Picker id="avoozl-switch-to"/)
  assert.match(dialog, /modelOptions\(/, 'To offers auto and Kiro Crew\'s models')
  assert.match(dialog, /models === 'failed' \?/)
  assert.match(dialog, /could not be read, so there is no list/)
  assert.match(dialog, /change model at their next turn\. Each keeps its branch and worktree/)
  assert.match(dialog, /Routing skips the From provider or model for new tasks/)
  // Step 2 is the dry run; Confirm sends its hash, and a 409 shows the difference.
  assert.match(dialog, /client\.dryRun\(/)
  assert.match(dialog, /previewHash: dry\.previewHash/)
  assert.match(dialog, /setChanged\(dryRunDiff\(dry, next\)\)/)
  assert.match(dialog, /onClick=\{\(\) => setStep\('choose'\)\} data-switch-back/)
  const settings = source('SettingsView.tsx')
  assert.match(settings, /tab === 'providers' \? \(\s*<ProvidersSettings/)
  assert.match(source('views-api.ts'), /'provider-out': 'Provider out'/)
})

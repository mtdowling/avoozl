// Settings > Models: the one roles table (R98.6, R98.7), a themed picker
// per role, saved as `roles` in .avoozl.json. Switch model is gone.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { ROLES, harnessOptions, rolesProblem, toRoles } from '../src/models-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('every role is one row, and auto or blank fields leave a row out', () => {
  assert.deepEqual(
    ROLES.map((r) => r.key),
    ['worker', 'falsifier', 'planner', 'planReviewer', 'retro', 'reviewDraft'],
  )
  assert.deepEqual(
    ROLES.filter((r) => r.agent).map((r) => r.key),
    ['worker', 'falsifier'],
  )
  assert.deepEqual(toRoles({ planner: { model: 'm1' }, reviewDraft: { model: 'auto' }, retro: { model: '', harness: 'auto' } }), { planner: { model: 'm1' } })
  assert.deepEqual(toRoles({ worker: { agent: ' alt ', model: 'm1', harness: 'claude-code' } }), { worker: { agent: 'alt', model: 'm1', harness: 'claude-code' } })
  assert.deepEqual(toRoles({ planReviewer: { model: 'auto' } }), {})
  assert.equal(rolesProblem({ worker: { agent: 'ok-agent' } }), null)
  assert.match(rolesProblem({ falsifier: { agent: 'bad agent!' } }), /Falsifier agent/)
})

test('Settings has a Models section with a themed picker per role; Flow and Delivery pick no model', () => {
  const settings = source('SettingsView.tsx')
  assert.match(settings, /\{ key: 'models', label: 'Models' \}/)
  assert.match(settings, /if \(tab === 'models'\) return <ModelsSettings workspaceId=\{workspaceId\} \/>/)
  const models = source('ModelsSettings.tsx')
  assert.match(models, /ROLES\.map\(\(role\) =>/)
  assert.match(models, /<Picker\s+id=\{`avoozl-model-\$\{role\.key\}`\}/)
  assert.match(models, /<Picker\s+id=\{`avoozl-harness-\$\{role\.key\}`\}/)
  assert.match(models, /role\.agent && \(/)
  assert.match(source('models-api.ts'), /'models\.settings\.update', \{ roles: toRoles\(roles\), expectedHash \}/)
  assert.doesNotMatch(source('FlowSettings.tsx'), /avoozl-flow-model|modelOptions/)
  assert.doesNotMatch(source('DeliverySettings.tsx'), /avoozl-delivery-(agent|model)|modelOptions|delivery\.model/)
})

test('Settings > Models says person-only refusal in a Kiro Crew chat is only a speed bump (R95.7)', () => {
  assert.match(source('ModelsSettings.tsx'), /Kiro Crew chats run as you\. Avoozl refuses person-only actions in them, but that only slows an agent down: it is not a lock\./)
})

test('Switch model, its dialog and the bulk switch calls are gone from the page', () => {
  assert.equal(existsSync(new URL('../src/SwitchModel.tsx', import.meta.url)), false)
  for (const name of ['App.tsx', 'providers-api.ts'])
    assert.doesNotMatch(source(name), /SwitchModel|provider\.switch/, name)
})

// R98.3: a harness per role: auto, the Kiro Crew chat, or this machine's files.
test('every role picks a harness: auto, the Kiro Crew chat, or this machine\u2019s files', () => {
  assert.deepEqual(
    harnessOptions(
      [
        { name: 'claude-code', approved: true },
        { name: 'codex', approved: false },
      ],
      'gone-cli',
    ),
    [
      { value: 'auto', label: 'auto (project default)' },
      { value: 'kirocrew', label: 'Kiro Crew chat' },
      { value: 'claude-code', label: 'claude-code' },
      { value: 'codex', label: 'codex (not approved)' },
      { value: 'gone-cli', label: 'gone-cli (not on this machine)' },
    ],
  )
})

// Settings > Models: one themed picker per Avoozl chat role, saved as
// `models` in .avoozl.json. Switch model is gone from the page.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { HARNESS_ROLES, MODEL_ROLES, harnessOptions, harnessTakesModel, roleIsSet, roleProblem, toHarnesses, toModels } from '../src/models-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('the roles are Avoozl’s own chats, and auto or blank leaves a role out', () => {
  assert.deepEqual(
    MODEL_ROLES.map((r) => r.key),
    ['planner', 'planReviewer', 'retro', 'reviewDraft'],
  )
  assert.deepEqual(toModels({ planner: 'm1', reviewDraft: 'auto', retro: '' }), { planner: 'm1' })
  assert.deepEqual(toModels({ planner: 'fake-writer', planReviewer: 'fake-reviewer' }), { planner: 'fake-writer', planReviewer: 'fake-reviewer' })
  assert.deepEqual(toModels({ planReviewer: 'auto' }), {})
})

test('Settings has a Models section with a themed picker per role; Flow has no model picker', () => {
  const settings = source('SettingsView.tsx')
  assert.match(settings, /\{ key: 'models', label: 'Models' \}/)
  assert.match(settings, /if \(tab === 'models'\) return <ModelsSettings workspaceId=\{workspaceId\} \/>/)
  const models = source('ModelsSettings.tsx')
  assert.match(models, /HARNESS_ROLES\.map\(\(role\) =>/)
  assert.match(models, /<Picker\s+id=\{`avoozl-model-\$\{role\.key\}`\}/)
  assert.match(models, /<Picker\s+id=\{`avoozl-harness-\$\{role\.key\}`\}/)
  assert.match(source('models-api.ts'), /'models\.settings\.update', \{ models: toModels\(models\), harnesses: toHarnesses\(harnesses\), expectedHash \}/)
  assert.doesNotMatch(source('FlowSettings.tsx'), /avoozl-flow-model|modelOptions/)
})

test('Settings > Models says person-only refusal in a Kiro Crew chat is only a speed bump (R95.7)', () => {
  assert.match(source('ModelsSettings.tsx'), /Kiro Crew chats run as you\. Avoozl refuses person-only actions in them, but that only slows an agent down: it is not a lock\./)
})

test('Switch model, its dialog and the bulk switch calls are gone from the page', () => {
  assert.equal(existsSync(new URL('../src/SwitchModel.tsx', import.meta.url)), false)
  for (const name of ['App.tsx', 'providers-api.ts'])
    assert.doesNotMatch(source(name), /SwitchModel|provider\.switch/, name)
})

// R98.3: a harness per role, the worker included; its model stays in Delivery.
test('every role picks a harness: auto, the Kiro Crew chat, or this machine\u2019s files', () => {
  assert.deepEqual(
    HARNESS_ROLES.map((r) => r.key),
    ['worker', 'planner', 'planReviewer', 'retro', 'reviewDraft'],
  )
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
  assert.deepEqual(toHarnesses({ worker: 'claude-code', planner: 'auto', retro: '' }), { worker: 'claude-code' })
})

test('a role is default until a harness or model is set, and an unusable combo is a problem', () => {
  const defs = [
    { name: 'claude-code', approved: true, model: true },
    { name: 'plain-cli', approved: true, model: false },
  ]
  assert.equal(roleIsSet('retro', {}, {}), false)
  assert.equal(roleIsSet('retro', { retro: 'auto' }, { retro: 'auto' }), false)
  assert.equal(roleIsSet('retro', { retro: 'm1' }, {}), true)
  assert.equal(roleIsSet('worker', { retro: 'm1' }, { worker: 'claude-code' }), true)
  assert.equal(harnessTakesModel('plain-cli', defs), false)
  assert.equal(harnessTakesModel('claude-code', defs), true)
  assert.equal(harnessTakesModel('kirocrew', defs), true)
  assert.equal(harnessTakesModel('auto', defs), true)
  assert.match(roleProblem('retro', { retro: 'm1' }, { retro: 'plain-cli' }, defs), /plain-cli takes no model/)
  assert.equal(roleProblem('retro', { retro: 'm1' }, { retro: 'claude-code' }, defs), null)
  assert.equal(roleProblem('retro', { retro: 'auto' }, { retro: 'plain-cli' }, defs), null)
  assert.match(roleProblem('planReviewer', { planner: 'm1', planReviewer: 'm1' }, {}, defs), /different model/)
  assert.equal(roleProblem('planReviewer', { planner: 'm1', planReviewer: 'm2' }, {}, defs), null)
})

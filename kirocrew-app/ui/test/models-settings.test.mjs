// Settings > Models: one themed picker per Avoozl chat role, saved as
// `models` in .avoozl.json. Switch model is gone from the page.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { HARNESS_ROLES, MODEL_ROLES, harnessOptions, toHarnesses, toModels } from '../src/models-api.ts'

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
  assert.match(source('ModelsSettings.tsx'), /hasModel\(role\.key\) && \(/)
})

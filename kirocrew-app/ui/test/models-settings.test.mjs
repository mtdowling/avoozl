// Settings > Models: one themed picker per Avoozl chat role, saved as
// `models` in .avoozl.json. Switch model is gone from the page.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { MODEL_ROLES, toModels } from '../src/models-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('the roles are Avoozl’s own chats, and auto or blank leaves a role out', () => {
  assert.deepEqual(
    MODEL_ROLES.map((r) => r.key),
    ['planner', 'driver', 'retro', 'reviewDraft'],
  )
  assert.deepEqual(toModels({ planner: 'm1', driver: 'auto', retro: '' }), { planner: 'm1' })
})

test('Settings has a Models section with a themed picker per role; Flow has no model picker', () => {
  const settings = source('SettingsView.tsx')
  assert.match(settings, /\{ key: 'models', label: 'Models' \}/)
  assert.match(settings, /if \(tab === 'models'\) return <ModelsSettings workspaceId=\{workspaceId\} \/>/)
  const models = source('ModelsSettings.tsx')
  assert.match(models, /MODEL_ROLES\.map\(\(role\) =>/)
  assert.match(models, /<Picker\s+id=\{`avoozl-model-\$\{role\.key\}`\}/)
  assert.match(source('models-api.ts'), /'models\.settings\.update', \{ models: toModels\(models\), expectedHash \}/)
  assert.doesNotMatch(source('FlowSettings.tsx'), /avoozl-flow-model|modelOptions/)
})

test('Switch model, its dialog and the bulk switch calls are gone from the page', () => {
  assert.equal(existsSync(new URL('../src/SwitchModel.tsx', import.meta.url)), false)
  for (const name of ['App.tsx', 'providers-api.ts'])
    assert.doesNotMatch(source(name), /SwitchModel|provider\.switch/, name)
})

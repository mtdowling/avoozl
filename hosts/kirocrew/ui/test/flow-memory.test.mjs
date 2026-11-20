// The diff block, and what Flow and Settings › Flow no longer carry: retros,
// proposals, prompt overrides and plugin notes.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { diffLines, toFlowForm, toFlowSection } from '../src/flow-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('a diff reads as hunk, same, added and removed lines', () => {
  assert.deepEqual(
    diffLines('@@ -1,1 +1,2 @@\n a\n+b\n-c').map((l) => l.kind),
    ['hunk', 'same', 'add', 'del'],
  )
})

test('Settings > Flow saves no CI or lessons keys', () => {
  assert.deepEqual(toFlowSection(toFlowForm({})).flow, {})
  assert.equal('ci' in toFlowSection(toFlowForm({ ci: { windowDays: 3 } })).flow, false)
  assert.doesNotMatch(source('FlowSettings.tsx'), /flow\.lessons|flow\.ci|data-override-warning/)
})

test('Flow keeps its charts, with no retros, proposals or extras', () => {
  const view = source('FlowView.tsx')
  assert.match(view, /data-timing-versions/)
  assert.doesNotMatch(view, /FlowBuilds|CiFlow|PlanningFlow|UsagePanel/)
  for (const gone of ['RetrosView.tsx', 'FlowMemory.tsx', 'PromptInstructions.tsx', 'FlowBuilds.tsx', 'CiFlow.tsx', 'PlanningFlow.tsx', 'builds-api.ts', 'providers-api.ts'])
    assert.equal(existsSync(new URL(`../src/${gone}`, import.meta.url)), false, gone)
  assert.doesNotMatch(source('flow-api.ts'), /flow\.proposals|flow\.retro|prompt\.override/)
  assert.doesNotMatch(source('PluginsSettings.tsx'), /SkillNote|data-plugin-notes/)
})

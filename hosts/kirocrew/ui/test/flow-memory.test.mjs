// Retro proposals under each retro, and the diff block (design §4.18). Prompt,
// skill and rule proposals, prompt overrides and plugin notes went with the
// flow extras (SM14.1).
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { diffLines, proposalText, toFlowForm, toFlowSection } from '../src/flow-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('settings and plan proposals read as one line each', () => {
  const base = { id: 'p1', metric: 'lead time', direction: 'down', status: 'open', evidence: 'e' }
  assert.equal(proposalText({ ...base, type: 'plan', change: 'Split 2.1', spec: 's' }), 'Split 2.1 (spec s)')
  assert.equal(proposalText({ ...base, type: 'settings', key: 'flow.retro.everyTasks', from: 10, to: 5 }), 'flow.retro.everyTasks 10 → 5')
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

test('Retros is one page whose proposals carry Approve and Reject; Flow keeps its charts', () => {
  const view = source('FlowView.tsx'),
    retros = source('RetrosView.tsx')
  assert.match(retros, /<ProposalCard/)
  assert.doesNotMatch(retros, /ProposalsView|RetroChat/)
  assert.doesNotMatch(source('nav-api.ts'), /RETROS_PAGES/)
  assert.match(view, /data-timing-versions/)
  assert.doesNotMatch(view, /FlowBuilds|CiFlow|PlanningFlow|UsagePanel/)
  for (const gone of ['FlowBuilds.tsx', 'CiFlow.tsx', 'PlanningFlow.tsx', 'builds-api.ts', 'providers-api.ts'])
    assert.equal(existsSync(new URL(`../src/${gone}`, import.meta.url)), false, gone)
  assert.doesNotMatch(source('flow-api.ts'), /flow\.proposals|prompt\.override/)
  assert.doesNotMatch(source('PluginsSettings.tsx'), /SkillNote|data-plugin-notes/)
})

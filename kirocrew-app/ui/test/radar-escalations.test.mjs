// Issue Radar escalations in Intake and Needs you (R103.8-R103.10, task
// 56.14): the confirm text and how the page wires the two buttons.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { escalationAsk } from '../src/untriaged-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const ESCALATION = { label: 'crew: needs human', scope: 'new-feature', claimed: false, draft: null }

test('the confirm says what Avoozl writes and that the crew label stays', () => {
  const plan = escalationAsk('o/app #12', 'Add a farewell function', ESCALATION, 'plan')
  assert.equal(plan.title, 'Plan o/app #12?')
  assert.equal(plan.action, 'Plan this')
  assert.match(plan.body, /adds crew:avoozl/)
  assert.match(plan.body, /"crew: needs human" stays/)
  assert.doesNotMatch(plan.body, /claimed/)
  const deliver = escalationAsk('o/app #12', 'Add a farewell function', ESCALATION, 'deliver')
  assert.equal(deliver.action, 'Deliver this')
  assert.match(deliver.body, /bounded-fix task/)
})

test('a live crew claim asks to take it over', () => {
  const ask = escalationAsk('o/app #14', 'Round or truncate?', { ...ESCALATION, claimed: true }, 'plan')
  assert.equal(ask.title, 'Take over o/app #14?')
  assert.match(ask.body, /crew is working on this issue/)
  assert.match(ask.body, /does not remove/)
})

test('Intake and Needs you start an escalation through GitHub intake, asked first', () => {
  const intake = source('UntriagedView.tsx')
  assert.match(intake, /item\.escalation\) \{\s*if \(!\(await ask\(escalationAsk\(/)
  assert.match(intake, /client\.start\(workspaceId, item, action, \{ confirmClaim: item\.escalation\.claimed \}\)/)
  assert.match(intake, /Radar asked/)
  const needs = source('ConflictsView.tsx')
  assert.match(needs, /item\.reason === 'crew' && item\.item && item\.escalation && item\.start/)
  assert.match(needs, /ask\(escalationAsk\(name, title, item\.escalation!, action\)\)\.then\(\(yes\) => yes && onStart\(action\)\)/)
  assert.match(source('untriaged-api.ts'), /confirmClaim: true/)
})

test('an escalation row with buttons does not say to settle it on GitHub', async () => {
  const { noActionReason } = await import('../src/conflicts-api.ts')
  const row = { kind: 'needs-human', reason: 'crew', authority: 'github', taskId: null, title: 't', detail: 'd' }
  assert.equal(noActionReason({ ...row, start: { plan: true, deliver: true } }), null)
})

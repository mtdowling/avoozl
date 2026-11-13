// Task 28.8: the Flow tab's Proposals and Lessons views, Settings > Flow >
// Lessons, and the plugin card's lessons pack and notes (design §4.18).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { diffLines, evidenceText, lessonStateText, proposalText, shareRank, toFlowForm, toFlowSection } from '../src/flow-api.ts'
import { lessonsPackText } from '../src/plugins-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('prompt, skill and lesson proposals read as one line each, with structured evidence', () => {
  const base = { id: 'p1', metric: 'first-pass rate', direction: 'up', status: 'open' }
  assert.equal(proposalText({ ...base, type: 'prompt', target: 'brief.worker', section: 'steps', evidence: 'e' }), 'brief.worker § steps')
  assert.equal(proposalText({ ...base, type: 'prompt', target: 'brief.worker', revert: true, evidence: 'e' }), 'Revert brief.worker')
  assert.equal(proposalText({ ...base, type: 'skill', target: 'repo:app:.kiro/skills/t/SKILL.md', evidence: 'e' }), 'skill repo:app:.kiro/skills/t/SKILL.md')
  assert.equal(proposalText({ ...base, type: 'lesson', kind: 'merge', lessons: ['L-1', 'L-2'], evidence: 'e' }), 'merge L-1, L-2')
  assert.equal(evidenceText({ evidence: { runs: ['4.1#1', '4.2#2', '4.3#1'], value: '50%', effect: 'fewer rejections' } }), '4.1#1, 4.2#2, 4.3#1 · now 50% · fewer rejections')
  assert.equal(evidenceText({ evidence: 'plain' }), 'plain')
  assert.deepEqual(
    diffLines('@@ -1,1 +1,2 @@\n a\n+b\n-c').map((l) => l.kind),
    ['hunk', 'same', 'add', 'del'],
  )
})

test('a lesson shows its state and stale reason, and kept, confirmed ones rank first to share', () => {
  assert.equal(lessonStateText({ state: 'stale', staleReason: 'check `lint` was removed', outcome: 'kept' }), 'stale: check `lint` was removed')
  assert.equal(lessonStateText({ state: 'ok', staleReason: null, outcome: 'undone' }), 'did not work')
  assert.equal(lessonStateText({ state: 'retired', staleReason: 'merged into L-1', outcome: 'kept' }), 'retired: merged into L-1')
  const l = (id, extra) => ({ id, outcome: 'kept', state: 'ok', readOnly: false, confidence: 0.5, evidence: { tasks: 10 }, ...extra })
  assert.deepEqual(
    shareRank([l('a', { confidence: 0.6 }), l('b', { confidence: 0.9 }), l('c', { outcome: 'undone' }), l('d', { readOnly: true }), l('e', { state: 'stale' })]).map((x) => x.id),
    ['b', 'a'],
  )
})

test('Settings > Flow > Lessons leaves blanks to their defaults and refuses bad numbers', () => {
  assert.deepEqual(toFlowSection(toFlowForm({})).flow, {})
  const form = { ...toFlowForm({}), share: 'off', read: 'on', untestedDays: '30', reviewEvery: '3' }
  assert.deepEqual(toFlowSection(form).flow.lessons, { share: false, read: true, untestedDays: 30, reviewEvery: 3 })
  assert.match(toFlowSection({ ...form, confirmDays: '0' }).error, /Confirm within must be a whole number 1–3650/)
  assert.deepEqual(toFlowForm({ lessons: { share: false, confirmDays: 200 } }).share, 'off')
  const settings = source('FlowSettings.tsx')
  for (const raw of ['flow.lessons.untestedDays', 'flow.lessons.confirmDays', 'flow.lessons.reviewEvery', '`flow.lessons.${key}`'])
    assert.ok(settings.includes(raw), raw)
  assert.match(settings, /\['share', "Share this workspace's lessons"\]/)
  assert.match(settings, /Lessons stay on this computer/)
  assert.match(settings, /data-override-warning/)
})

test('the Flow tab has Overview, Proposals and Lessons, and every write asks a person', () => {
  const view = source('FlowView.tsx'),
    memory = source('FlowMemory.tsx')
  assert.match(view, /'overview'[\s\S]*'proposals'[\s\S]*'lessons'/)
  assert.match(view, /<ProposalsView/)
  assert.match(view, /<LessonsView/)
  assert.match(view, /data-timing-versions/)
  // Revert and retire ask first (a confirm dialog naming the item).
  assert.match(memory, /title: `Revert \$\{p\.target\}\?`/)
  assert.match(memory, /title: 'Retire these lessons\?'/)
  for (const part of ['data-prompt-drift', 'Approve rebase', 'Cites', 'History', 'confidence', 'Export lessons', 'Pattern', 'Outcome', 'Source', 'State'])
    assert.ok(memory.includes(part), part)
})

test('the plugin card previews and imports a lessons pack and shows suggested changes', () => {
  assert.equal(
    lessonsPackText({ plugin: 'p1', version: '2.0.0', hash: 'h', rows: [{ action: 'add' }, { action: 'change' }, { action: 'retire' }] }),
    'Version 2.0.0: 1 new, 1 changed, 0 unchanged, 1 retired.',
  )
  const card = source('PluginsSettings.tsx')
  assert.match(card, /Preview lessons pack/)
  assert.match(card, /lessonsImport\(workspaceId, id, preview\.hash\)/)
  assert.match(card, /data-plugin-notes/)
  assert.match(card, /Avoozl sends nothing/)
})

// Task 28.8: the Flow tab's Proposals view and the plugin card's notes
// (design §4.18). The Lessons view, Settings > Flow > Lessons, lessons packs
// and Share went with the lessons store (RC30.4).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { diffLines, evidenceText, proposalText, toFlowForm, toFlowSection } from '../src/flow-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('prompt, skill and rule proposals read as one line each, with structured evidence', () => {
  const base = { id: 'p1', metric: 'first-pass rate', direction: 'up', status: 'open' }
  assert.equal(proposalText({ ...base, type: 'prompt', target: 'brief.worker', section: 'steps', evidence: 'e' }), 'brief.worker § steps')
  assert.equal(proposalText({ ...base, type: 'prompt', target: 'brief.worker', revert: true, evidence: 'e' }), 'Revert brief.worker')
  assert.equal(proposalText({ ...base, type: 'skill', target: 'repo:app:.kiro/skills/t/SKILL.md', evidence: 'e' }), 'skill repo:app:.kiro/skills/t/SKILL.md')
  assert.equal(proposalText({ ...base, type: 'rule', text: 'Add a test for empty input.', evidence: 'e' }), 'rule: Add a test for empty input.')
  assert.equal(evidenceText({ evidence: { runs: ['4.1#1', '4.2#2', '4.3#1'], value: '50%', effect: 'fewer rejections' } }), '4.1#1, 4.2#2, 4.3#1 · now 50% · fewer rejections')
  assert.equal(evidenceText({ evidence: 'plain' }), 'plain')
  assert.deepEqual(
    diffLines('@@ -1,1 +1,2 @@\n a\n+b\n-c').map((l) => l.kind),
    ['hunk', 'same', 'add', 'del'],
  )
})

test('Settings > Flow has no Lessons group and saves no flow.lessons', () => {
  assert.deepEqual(toFlowSection(toFlowForm({})).flow, {})
  assert.equal('lessons' in toFlowSection(toFlowForm({ lessons: { share: false } })).flow, false)
  const settings = source('FlowSettings.tsx')
  assert.doesNotMatch(settings, /flow\.lessons|Lessons/)
  assert.match(settings, /data-override-warning/)
})

test('the Flow tab has Overview, Retros and Proposals, and every write asks a person', () => {
  const view = source('FlowView.tsx'),
    memory = source('FlowMemory.tsx')
  assert.match(view, /useState<'overview' \| 'retros' \| 'proposals'>/)
  assert.match(view, /<ProposalsView/)
  assert.doesNotMatch(view, /LessonsView|'lessons'/)
  assert.match(view, /data-timing-versions/)
  // Revert asks first (a confirm dialog naming the item).
  assert.match(memory, /title: `Revert \$\{p\.target\}\?`/)
  for (const part of ['data-prompt-drift', 'Approve rebase'])
    assert.ok(memory.includes(part), part)
  assert.doesNotMatch(memory, /LessonsView|Export lessons|sharePreview/)
  // A failed lessons export says why (RC30.5).
  assert.match(memory, /value\.lessonsExport\?\.error && \(/)
})

test('the plugin card shows suggested changes and no lessons pack', () => {
  const card = source('PluginsSettings.tsx')
  assert.doesNotMatch(card, /LessonsPack|lessonsImport|Preview lessons pack/)
  assert.match(card, /data-plugin-notes/)
  assert.match(card, /Avoozl sends nothing/)
})

// Phase 34 in the page (design §4.21, §4.25): the findings and Ready to
// merge items in Needs you, and how they are wired.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CONFLICT_TABS, noActionReason } from '../src/conflicts-api.ts'
import { CONFLICT_LABELS } from '../src/views-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
test('findings and Ready to merge are Needs you items with their own actions', () => {
  for (const kind of ['investigation', 'ready-to-merge']) {
    const item = { kind, taskId: 'a1', title: 't', detail: 'd', authority: 'local' }
    assert.equal(noActionReason(item), null, kind)
    assert.ok(CONFLICT_TABS.find((tab) => tab.key === 'needs-human').keep(item), kind)
    assert.ok(CONFLICT_LABELS[kind], kind)
  }
  const page = source('ConflictsView.tsx')
  for (const words of ['Go ahead', 'Investigate again', 'Integrate', 'Open pull request']) assert.ok(page.includes(words), words)
  assert.match(source('views-api.ts'), /'investigation\.decide'/)
  assert.match(source('views-api.ts'), /'delivery\.integrate'/)
})

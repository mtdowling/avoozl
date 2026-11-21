// @ts-nocheck: typing debt
// Phase 34 in the page (design §4.25): the Ready to merge items in Needs
// you, and how they are wired.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CONFLICT_TABS, noActionReason } from '../src/conflicts-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
test('pull requests Avoozl opened are Needs you items with their own actions', () => {
  const item = { kind: 'branch-landing', taskId: 'a1', title: 't', detail: 'd', authority: 'local' }
  assert.equal(noActionReason(item), null)
  assert.ok(CONFLICT_TABS.find((tab) => tab.key === 'needs-human').keep(item))
  for (const reason of ['draft-pr', 'pr-merge']) assert.equal(noActionReason({ ...item, kind: 'needs-human', reason }), null, reason)
  const page = source('ConflictsView.tsx')
  for (const words of ['Approve', 'Merge', 'Open pull request']) assert.ok(page.includes(words), words)
  assert.doesNotMatch(source('views-api.ts'), /'investigation\.decide'/)
  assert.match(source('views-api.ts'), /'landing\.ready'/)
  assert.match(source('views-api.ts'), /'landing\.merge'/)
})

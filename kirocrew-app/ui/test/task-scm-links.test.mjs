// The task Links box's words (R92.3, R92.5): check state names its head and
// age, and a read for another head never reads as the current one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checksLine, scmLabel } from '../src/task-api.ts'

const NOW = Date.parse('2026-11-13T10:00:00Z')
const checks = (over = {}) => ({
  state: 'pass',
  head: 'a'.repeat(40),
  readAt: '2026-11-13T09:55:00Z',
  ageMs: 300000,
  current: true,
  dot: 'pass',
  source: 'pull-request',
  url: null,
  ...over,
})

test('check state names its head and age, and says when the head is not current', () => {
  assert.equal(checksLine(checks(), NOW), 'Passed on aaaaaaa · 5 min ago')
  assert.equal(checksLine(checks({ state: 'fail', dot: 'fail' }), NOW), 'Failed on aaaaaaa · 5 min ago')
  assert.equal(checksLine(checks({ current: false, dot: 'stale' }), NOW), 'Passed on aaaaaaa, not the current head · 5 min ago')
  assert.equal(checksLine(checks({ readAt: null }), NOW), 'Passed on aaaaaaa')
})

test('a link shows owner/name#N, a branch or a short SHA', () => {
  assert.equal(scmLabel({ kind: 'pull', repository: 'o/r', number: 4, url: 'u' }), 'o/r#4')
  assert.equal(scmLabel({ kind: 'issue', repository: 'o/r', number: 7, url: 'u' }), 'o/r#7')
  assert.equal(scmLabel({ kind: 'branch', repository: 'o/r', ref: 'avoozl/x', url: 'u' }), 'avoozl/x')
  assert.equal(scmLabel({ kind: 'commit', repository: 'o/r', sha: 'c'.repeat(40), url: 'u' }), 'ccccccc')
})

test('every link opens in a new tab and the worktree is never a link', () => {
  const view = readFileSync(new URL('../src/TaskScmLinks.tsx', import.meta.url), 'utf8')
  const anchors = [...view.matchAll(/<a\b[^>]*>/g)].map((m) => m[0])
  assert.ok(anchors.length >= 1)
  for (const a of anchors) assert.match(a, /target="_blank" rel="noopener noreferrer"/)
  assert.doesNotMatch(view, /worktree[^\n]*href/)
  assert.doesNotMatch(view, /#[0-9a-f]{3,6}\b/i, 'theme variables only')
  // The drawer's Links box holds the stored links, then the added ones.
  const drawer = readFileSync(new URL('../src/TaskDrawer.tsx', import.meta.url), 'utf8')
  const box = drawer.slice(drawer.indexOf('<SectionBox id="task-links"'), drawer.indexOf('<SectionBox id="delivery"'))
  assert.ok(box.indexOf('<TaskScmLinks') > 0 && box.indexOf('<TaskScmLinks') < box.indexOf('<TaskLinks'))
  assert.doesNotMatch(drawer, /rel="noreferrer"/)
})

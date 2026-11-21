// @ts-nocheck: typing debt
// A pasted spec tab link opens the Specs page on that tab. The page has no
// DOM renderer in this test, so it checks the wiring in App.tsx's source.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseSpecTab, specTabLink, tabKey } from '../src/tabs.ts'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('a ?plan=P&tab=T link opens the Specs page when the page opens', () => {
  assert.match(app, /else if \(parseSpecTab\(window\.location\.search\)\) go\(\{ tab: 'plans'/)
})

test('the spec page keeps its tab in the address', () => {
  assert.equal(specTabLink('p1', 'overview'), '?plan=p1')
  assert.equal(specTabLink('p1', 'avoozl/manifest.json'), '?plan=p1&tab=avoozl%2Fmanifest.json')
  assert.deepEqual(parseSpecTab('?plan=p1'), { plan: 'p1', tab: 'overview' })
  assert.deepEqual(parseSpecTab('?plan=p1&tab=tasks'), { plan: 'p1', tab: 'tasks' })
  assert.deepEqual(parseSpecTab(specTabLink('p1', 'design.md')), { plan: 'p1', tab: 'design.md' })
  // A bad tab is dropped, and no plan is no place.
  assert.equal(parseSpecTab('?plan=p1&tab=../x'), null)
  assert.equal(parseSpecTab('?tab=tasks'), null)
  assert.equal(tabKey('ArrowRight', ['overview', 'tasks', 'design.md'], 'design.md'), 'overview')
})

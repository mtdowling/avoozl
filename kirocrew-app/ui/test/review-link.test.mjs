// A pasted Review view link (R104.9) opens the Specs page, which opens the
// view. The page has no DOM renderer in its tests, so this checks the wiring
// in App.tsx's source, next to the Trace and Graph links it sits beside.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('a ?view=review link opens the Specs page when the page opens', () => {
  assert.match(app, /import \{ parseReviewLink, parseSpecTab \} from '\.\/review-view\.ts'/)
  assert.match(app, /parseReviewLink\(window\.location\.search\) \|\| parseSpecTab\(window\.location\.search\)\) go\(\{ tab: 'plans'/)
})

const { parseSpecTab, specTabLink, tabKey } = await import('../src/review-view.ts')

test('the spec page keeps its tab in the address; Review keeps its own link', () => {
  assert.equal(specTabLink('p1', 'overview'), '?plan=p1')
  assert.equal(specTabLink('p1', 'avoozl/manifest.json'), '?plan=p1&tab=avoozl%2Fmanifest.json')
  assert.deepEqual(parseSpecTab('?plan=p1'), { plan: 'p1', tab: 'overview' })
  assert.deepEqual(parseSpecTab('?plan=p1&tab=tasks'), { plan: 'p1', tab: 'tasks' })
  assert.deepEqual(parseSpecTab(specTabLink('p1', 'design.md')), { plan: 'p1', tab: 'design.md' })
  // Review is not read here, a bad tab is dropped, and no plan is no place.
  assert.equal(parseSpecTab('?view=review&plan=p1'), null)
  assert.equal(parseSpecTab('?plan=p1&tab=review'), null)
  assert.equal(parseSpecTab('?plan=p1&tab=../x'), null)
  assert.equal(parseSpecTab('?tab=tasks'), null)
  assert.equal(tabKey('ArrowRight', ['overview', 'tasks', 'review'], 'review'), 'overview')
})

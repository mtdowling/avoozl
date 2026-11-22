// A pasted spec tab link opens the Specs page on that tab. The page has no
// DOM renderer in this test, so it checks the wiring in App.tsx's source.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseSpecTab, readSpecPlace, SPEC_PLACE_KEY, specTabLink, tabKey, writeSpecPlace } from '../src/tabs.ts'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const plansView = readFileSync(new URL('../src/PlansView.tsx', import.meta.url), 'utf8')

test('a ?plan=P&tab=T link opens the Specs page when the page opens', () => {
  assert.match(app, /else if \(parseSpecTab\(window\.location\.search\)\) go\(\{ tab: 'plans'/)
})

test('returning to Avoozl restores the main section and workspace spec tab', () => {
  assert.match(app, /useState<Tab>\(saved\.tab \?\? 'insights'\)/)
  assert.match(app, /writePageState\(storage\(\), \{ workspaceId, tab \}\)/)
  assert.match(plansView, /readSpecPlace\(pageStorage\(\), workspace\)/)
  assert.match(plansView, /writeSpecPlace\(pageStorage\(\), workspace, place\)/)
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

test('the last spec tab is stored per workspace and survives bad storage', () => {
  const store = new Map<string, string>()
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) }
  writeSpecPlace(storage, 'one', { plan: 'p1', tab: 'review' })
  writeSpecPlace(storage, 'two', { plan: 'p2', tab: 'design.md' })
  assert.deepEqual(readSpecPlace(storage, 'one'), { plan: 'p1', tab: 'review' })
  assert.deepEqual(readSpecPlace(storage, 'two'), { plan: 'p2', tab: 'design.md' })
  writeSpecPlace(storage, 'one', null)
  assert.equal(readSpecPlace(storage, 'one'), null)
  assert.deepEqual(readSpecPlace(storage, 'two'), { plan: 'p2', tab: 'design.md' })

  store.set(SPEC_PLACE_KEY, '{not json')
  assert.equal(readSpecPlace(storage, 'two'), null)
  store.set(SPEC_PLACE_KEY, JSON.stringify({ two: { plan: 'p2', tab: '../secret' } }))
  assert.equal(readSpecPlace(storage, 'two'), null)
})

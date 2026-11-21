// The nav row and its pages.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TABS, WAITING_SECTIONS, tabLabel } from '../src/nav-api.ts'

test('the nav row is Specs, Graph, In flight, Needs you, Activity, Settings', () => {
  assert.deepEqual(
    TABS.map((t) => t.label),
    ['Specs', 'Graph', 'In flight', 'Needs you', 'Activity', 'Settings'],
  )
  assert.equal(tabLabel('delivery'), 'In flight')
})

test('the nav has no Issues or Pull requests pill', () => {
  assert.ok(!TABS.some((t) => ['issues', 'pulls'].includes(t.key) || /^(Issues|Pull requests)$/.test(t.label)))
})

test('Needs you has one page', () => {
  assert.deepEqual(
    WAITING_SECTIONS.map((x) => [x.key, x.title]),
    [['decisions', 'Decisions']],
  )
  for (const x of WAITING_SECTIONS) assert.ok(x.line.length > 0 && !x.line.includes('\n'))
})

test('the Needs you nav row and badge show the decisions count', async () => {
  const app = (await import('node:fs')).readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const waitingCount = conflicts\n/)
  assert.match(app, /count: conflicts,/)
})

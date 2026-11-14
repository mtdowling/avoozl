// The nav row, and where removed pages go.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RETIRED_LINE, TABS, navTab, redirectSettings, redirectTab, retiredCoders, tabLabel } from '../src/nav-api.ts'

test('the nav row is Home, Epics, Waiting on you, Trace, Flow, Activity, Settings', () => {
  assert.deepEqual(TABS.map((t) => t.label), ['Home', 'Epics', 'Waiting on you', 'Trace', 'Flow', 'Activity', 'Settings'])
})

test('removed pages go to the page that took over, never nowhere', () => {
  assert.deepEqual(redirectTab('delivery'), { tab: 'dashboard' })
  assert.equal(redirectTab('conflicts').tab, 'waiting')
  assert.equal(redirectTab('untriaged').tab, 'waiting')
  assert.deepEqual(redirectTab('routing'), { tab: 'settings' })
  assert.deepEqual(redirectTab('nonsense'), { tab: 'dashboard' })
  for (const t of TABS) assert.deepEqual(redirectTab(t.key), { tab: t.key })
})

test('Graph is a page inside Epics', () => {
  assert.equal(redirectTab('graph').tab, 'graph')
  assert.equal(navTab('graph'), 'plans')
  assert.equal(tabLabel('graph'), 'Epics')
})

test('a Settings section that is gone lands on Repository setup', () => {
  assert.equal(redirectSettings('routing'), 'repositories')
  assert.equal(redirectSettings('flow'), 'flow')
})

test('a repository on the retired worker is named; the default counts', () => {
  const repos = [
    { name: 'a/one', coder: 'worker' },
    { name: 'a/two', coder: 'issue-radar' },
    { name: 'a/three', coder: '' },
  ]
  assert.deepEqual(retiredCoders(repos, 'issue-radar'), ['a/one'])
  assert.deepEqual(retiredCoders(repos, 'worker'), ['a/one', 'a/three'])
  assert.equal(RETIRED_LINE, 'Local workers are retired. Switch to Issue Radar.')
})

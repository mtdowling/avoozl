// The nav row, and where removed pages go.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DASHBOARD_PAGES, RETIRED_LINE, TABS, dashboardPage, dashboardTab, navTab, redirectSettings, redirectTab, redirectWaiting, WAITING_SECTIONS, retiredCoders, tabLabel } from '../src/nav-api.ts'

test('the nav row is Dashboards, Specs, Needs you, Flow, Activity, Settings', () => {
  assert.deepEqual(TABS.map((t) => t.label), ['Dashboards', 'Specs', 'Needs you', 'Flow', 'Activity', 'Settings'])
})

test('the nav has no Issues or Pull requests pill, and old links open Dashboards > Home', () => {
  for (const key of ['issues', 'pulls']) {
    assert.ok(!TABS.some((t) => t.key === key))
    assert.deepEqual(redirectTab(key), { tab: 'dashboard' })
  }
  assert.ok(!TABS.some((t) => /^(Issues|Pull requests)$/.test(t.label)))
})

test('removed pages go to the page that took over, never nowhere', () => {
  assert.deepEqual(redirectTab('delivery'), { tab: 'delivery' })
  assert.equal(redirectTab('conflicts').tab, 'waiting')
  assert.equal(redirectTab('untriaged').tab, 'waiting')
  assert.equal(redirectTab('untriaged').open['waiting-section'], 'triage')
  assert.deepEqual(redirectTab('routing'), { tab: 'settings' })
  assert.deepEqual(redirectTab('nonsense'), { tab: 'dashboard' })
  for (const t of TABS) assert.deepEqual(redirectTab(t.key), { tab: t.key })
})

test('Dashboards holds Home, Graph, Lanes, CI and Landing queue; an old Home link lands on Dashboards > Home', () => {
  assert.deepEqual(DASHBOARD_PAGES.map((p) => p.label), ['Home', 'Graph', 'Delivery', 'Lanes', 'CI', 'Landing queue'])
  assert.deepEqual(redirectTab('dashboard'), { tab: 'dashboard' })
  assert.equal(dashboardPage('dashboard'), 'home')
  for (const page of ['graph', 'delivery', 'lanes', 'ci', 'landing']) {
    assert.equal(redirectTab(page).tab, page)
    assert.equal(navTab(page), 'dashboard')
    assert.equal(dashboardPage(page), page)
    assert.equal(dashboardTab(page), page)
  }
  assert.equal(dashboardTab('home'), 'dashboard')
  assert.equal(tabLabel('graph'), 'Graph')
  assert.equal(tabLabel('landing'), 'Landing queue')
  // A Dashboards page, not its own nav pill.
  assert.ok(!TABS.some((t) => t.key === 'landing'))
  assert.equal(tabLabel('dashboard'), 'Home')
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

test('Needs you has three pages; old intake and untriaged links go to Triage, a saved radar view to Issue Radar', () => {
  assert.deepEqual(WAITING_SECTIONS.map((x) => [x.key, x.title]), [['decisions', 'Decisions'], ['triage', 'Triage'], ['radar', 'Issue Radar']])
  for (const x of WAITING_SECTIONS) assert.ok(x.line.length > 0 && !x.line.includes('\n'))
  assert.equal(redirectWaiting('intake'), 'triage')
  assert.equal(redirectWaiting('triage'), 'triage')
  assert.equal(redirectWaiting('intake', 'radar'), 'radar')
  assert.equal(redirectWaiting('decisions'), 'decisions')
  assert.equal(redirectWaiting(undefined), undefined)
})

test('the Needs you nav rows show their own counts, and the badge keeps its sum', async () => {
  const app = (await import('node:fs')).readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const waitingCount = conflicts \+ \(untriaged \?\? 0\)/)
  assert.match(app, /x\.key === 'decisions' \? conflicts : x\.key === 'triage' \? \(untriaged \?\? 0\) : radarCount/)
})

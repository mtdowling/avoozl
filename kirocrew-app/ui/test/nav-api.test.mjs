// The nav row and its pages.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DASHBOARD_PAGES, RETROS_PAGES, TABS, dashboardPage, dashboardTab, navTab, WAITING_SECTIONS, tabLabel } from '../src/nav-api.ts'

test('the nav row is Dashboards, Specs, Needs you, GitHub, Flow, Retros, Activity, Settings', () => {
  assert.deepEqual(
    TABS.map((t) => t.label),
    ['Dashboards', 'Specs', 'Needs you', 'GitHub', 'Flow', 'Retros', 'Activity', 'Settings'],
  )
})

test('Retros lists two pages', () => {
  assert.deepEqual(
    RETROS_PAGES.map((p) => p.label),
    ['Retros', 'Proposals'],
  )
  assert.equal(tabLabel('retros'), 'Retros')
})

test('the nav has no Issues or Pull requests pill', () => {
  assert.ok(!TABS.some((t) => ['issues', 'pulls'].includes(t.key) || /^(Issues|Pull requests)$/.test(t.label)))
})

test('Dashboards holds Home, Graph, Delivery and Landing queue', () => {
  assert.deepEqual(
    DASHBOARD_PAGES.map((p) => p.label),
    ['Home', 'Graph', 'Delivery', 'Landing queue'],
  )
  assert.equal(dashboardPage('dashboard'), 'home')
  for (const page of ['graph', 'delivery', 'landing']) {
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

test('Needs you has four pages', () => {
  assert.deepEqual(
    WAITING_SECTIONS.map((x) => [x.key, x.title]),
    [
      ['decisions', 'Decisions'],
      ['agent', 'From the agent'],
      ['triage', 'Triage'],
      ['radar', 'Issue Radar'],
    ],
  )
  for (const x of WAITING_SECTIONS) assert.ok(x.line.length > 0 && !x.line.includes('\n'))
})

test('the Needs you nav rows show their own counts, and the badge keeps its sum', async () => {
  const app = (await import('node:fs')).readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const waitingCount = conflicts \+ \(untriaged \?\? 0\)/)
  assert.match(app, /x\.key === 'decisions' \? conflicts : x\.key === 'agent' \? agentCount : x\.key === 'triage' \? \(untriaged \?\? 0\) : radarCount/)
})

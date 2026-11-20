// The nav row and its pages.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DASHBOARD_PAGES, TABS, dashboardPage, dashboardTab, navTab, WAITING_SECTIONS, tabLabel } from '../src/nav-api.ts'

test('the nav row is Dashboards, Specs, Needs you, Flow, Activity, Settings', () => {
  assert.deepEqual(
    TABS.map((t) => t.label),
    ['Dashboards', 'Specs', 'Needs you', 'Flow', 'Activity', 'Settings'],
  )
})

test('the nav has no Issues or Pull requests pill', () => {
  assert.ok(!TABS.some((t) => ['issues', 'pulls'].includes(t.key) || /^(Issues|Pull requests)$/.test(t.label)))
})

test('Dashboards holds Home, Graph and Delivery', () => {
  assert.deepEqual(
    DASHBOARD_PAGES.map((p) => p.label),
    ['Home', 'Graph', 'Delivery'],
  )
  assert.equal(dashboardPage('dashboard'), 'home')
  for (const page of ['graph', 'delivery']) {
    assert.equal(navTab(page), 'dashboard')
    assert.equal(dashboardPage(page), page)
    assert.equal(dashboardTab(page), page)
  }
  assert.equal(dashboardTab('home'), 'dashboard')
  assert.equal(tabLabel('graph'), 'Graph')
  assert.equal(tabLabel('dashboard'), 'Home')
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

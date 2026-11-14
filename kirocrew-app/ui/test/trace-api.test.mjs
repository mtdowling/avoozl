// rc-8.2: Trace's page helpers, the deep link and Back, and the wiring.
// Inputs checked: a link with and without a valid target, GitHub times that
// differ from a marker's, a step with no time, and a Back from a trace opened
// by URL.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { changePage, createNav } from '../src/nav-history.ts'
import { TRACE_TARGET, afterPrevious, clock, parseTraceLink, traceLink } from '../src/trace-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('a trace link round-trips and a bad one is ignored', () => {
  const link = traceLink({ repository: 'acme/recipe-box', number: 52 })
  assert.equal(link, '?trace=acme%2Frecipe-box%2352')
  assert.deepEqual(parseTraceLink(link), { repository: 'acme/recipe-box', number: 52 })
  for (const bad of ['', '?trace=', '?trace=x%2352', '?trace=a%2Fb%230', '?trace=a%2Fb%23x', '?trace=a%2Fb', '?other=1'])
    assert.equal(parseTraceLink(bad), null, bad)
})

test('times are GitHub UTC clock times, and gaps name the step before', () => {
  assert.equal(clock('2026-11-09T09:21:00Z'), 'Mon 09:21 UTC')
  assert.equal(clock(null), '—')
  const steps = [
    { label: 'Ready', at: '2026-11-09T09:15:00Z', state: 'done' },
    { label: 'Claimed', at: '2026-11-09T09:21:00Z', state: 'done' },
    { label: 'PR opened', at: null, state: 'skipped' },
    { label: 'CI', at: '2026-11-09T11:21:00Z', state: 'done' },
  ]
  assert.equal(afterPrevious(steps, 1), '6 min after Ready')
  assert.equal(afterPrevious(steps, 0), null)
  assert.equal(afterPrevious(steps, 2), null)
  // The previous step with a time, not the one drawn dashed.
  assert.equal(afterPrevious(steps, 3), '2 h after Claimed')
})

test('the page opens a trace from a deep link, and Back returns to where it was', () => {
  const nav = createNav((step) => step())
  const place = { tab: 'dashboard', settingsTab: 'workspaces', focus: null, drill: null }
  const apply = (next) => Object.assign(place, next)
  changePage(nav, { ...place }, { tab: 'trace' }, apply, (before) => `Back to ${before.tab}`, { [TRACE_TARGET]: { repository: 'a/b', number: 4 } })
  assert.equal(place.tab, 'trace')
  assert.deepEqual(nav.memory.get(TRACE_TARGET), { repository: 'a/b', number: 4 })
  assert.equal(nav.history.back(), true)
  assert.equal(place.tab, 'dashboard')
  assert.equal(nav.history.back(), false)
})

test('the wiring: a row opens the drawer, the drawer opens the page, the page reads the link', () => {
  assert.match(source('DashboardView.tsx'), /onTrace/)
  assert.match(source('App.tsx'), /parseTraceLink\(window\.location\.search\)/)
  assert.match(source('App.tsx'), /<TracePage/)
  assert.match(source('TraceView.tsx'), /<Modal[\s\S]*kind="drawer"/)
  assert.match(source('TraceView.tsx'), /nav\.history\.back\(\)/)
})

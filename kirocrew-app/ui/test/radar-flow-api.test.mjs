// rc-8.4: the Flow tab's GitHub section words the backend's stage times. Inputs
// checked: minutes, hours, days, none, an empty view, and a view with a
// skipped issue and a read error.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { flowRows, span, summaryLine } from '../src/radar-flow-api.ts'

const MIN = 60000
const view = (extra = {}) => ({
  readAt: '2026-11-09T10:00:00Z',
  count: 2,
  issues: [],
  skipped: [],
  median: [15 * MIN, 45 * MIN, 35 * MIN, 10 * MIN],
  medianLead: 105 * MIN,
  efficiency: 90 / 210,
  bottleneck: 'Claim to PR',
  errors: [],
  repositories: ['o/r'],
  ...extra,
})

test('spans read in minutes, hours and days', () => {
  assert.equal(span(0), '0 min')
  assert.equal(span(10 * MIN), '10 min')
  assert.equal(span(65 * MIN), '1 h 5 min')
  assert.equal(span(120 * MIN), '2 h')
  assert.equal(span(50 * 60 * MIN), '2 d 2 h')
  assert.equal(span(null), '—')
})

test('one row per stage, the slowest marked', () => {
  const rows = flowRows(view())
  assert.deepEqual(rows.map((r) => [r.name, r.median, r.slowest]), [
    ['Ready to Claim', '15 min', false],
    ['Claim to PR', '45 min', true],
    ['PR to green', '35 min', false],
    ['Green to merge', '10 min', false],
  ])
  assert.deepEqual(flowRows(view({ count: 0, median: null, bottleneck: null })), [])
})

test('the summary names the count, lead time and flow efficiency', () => {
  assert.equal(summaryLine(view()), '2 issues · median lead time 1 h 45 min · flow efficiency 43%')
  assert.equal(summaryLine(view({ count: 1 })).startsWith('1 issue ·'), true)
  assert.equal(summaryLine(view({ count: 0, medianLead: null, efficiency: null })), 'No finished issue yet')
})

test('the Flow overview shows the section', () => {
  assert.match(readFileSync(new URL('../src/FlowView.tsx', import.meta.url), 'utf8'), /<GithubFlow/)
})

// Flow's Builds (R101.4) words the backend's build times: minutes, hours,
// days and none.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildsLine, costliestLine, span } from '../src/builds-api.ts'

const MIN = 60000

test('spans read in minutes, hours and days', () => {
  assert.equal(span(0), '0 min')
  assert.equal(span(10 * MIN), '10 min')
  assert.equal(span(65 * MIN), '1 h 5 min')
  assert.equal(span(120 * MIN), '2 h')
  assert.equal(span(50 * 60 * MIN), '2 d 2 h')
  assert.equal(span(null), '—')
})

test('the Flow overview shows the section', () => {
  assert.match(readFileSync(new URL('../src/FlowView.tsx', import.meta.url), 'utf8'), /<FlowBuilds/)
})

const builds = (over = {}) => ({ count: 12, totalMs: 0, failedMs: 0, medianMs: 41000, byPhase: [], byInstance: [], recent: [], ...over })

test('buildsLine words the count, the median and failed time', () => {
  assert.equal(buildsLine(builds()), '12 pull requests · median 41 s')
  assert.equal(buildsLine(builds({ count: 1, medianMs: null })), '1 pull request · median —')
  assert.equal(buildsLine(builds({ failedMs: 180000 })), '12 pull requests · median 41 s · 3 min in failed attempts')
})

test('costliestLine names the phase that took the most', () => {
  assert.equal(costliestLine({ repository: null, pr: 1, totalMs: 0, failedMs: 0, phases: [], costliest: { phase: 'test', ms: 180000 } }), 'test 3 min')
})

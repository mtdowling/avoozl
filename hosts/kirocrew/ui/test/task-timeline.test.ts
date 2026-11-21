// @ts-nocheck: typing debt
// Trace is gone (Requirement 106): task details hold the Timeline of
// Avoozl's task records, and nothing new calls GitHub.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { TABS } from '../src/nav-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('there is no Trace nav entry, page, drawer or Done list', () => {
  assert.ok(!TABS.some((t) => t.key === 'trace' || t.label === 'Trace'))
  for (const name of ['TraceView.tsx', 'TraceDone.tsx', 'trace-api.ts']) assert.equal(existsSync(new URL(`../src/${name}`, import.meta.url)), false, name)
  for (const name of ['App.tsx', 'InFlight.tsx']) assert.doesNotMatch(source(name), /Trace(View|Drawer|Page)|onTrace|radar\.trace|trace\.done/, name)
})

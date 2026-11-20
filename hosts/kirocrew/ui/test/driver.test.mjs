// The spec driver on the page (R66.9, design §6.10): the chip's words,
// the banner's reason and spec issue link, This computer's form, and where
// each piece is wired. The driver is the spec issue's assignee; there is no
// Hand off or Take over.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ago, bannerTitle, chipText, rowDriverText, toMachineSettings } from '../src/driver-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const NOW = Date.parse('2026-11-13T12:00:00Z')
const spec = (patch = {}) => ({
  planId: 's1',
  spec: 's1',
  mode: 'github',
  state: 'read-only',
  reason: 'other-person',
  you: false,
  text: 'It is assigned to octocat on GitHub.',
  assignees: ['octocat'],
  issue: { number: 12, url: 'https://github.com/acme/plans/issues/12' },
  ...patch,
})

test('the chip and the Specs list row say who the spec issue is assigned to', () => {
  assert.equal(chipText(spec({ you: true, state: 'driver', reason: 'driver' })), 'Driver: you')
  assert.equal(chipText(spec()), 'Taken by octocat')
  assert.equal(chipText(spec({ reason: 'several', assignees: ['a', 'b'] })), 'Driver: nobody · 2 assignees')
  assert.equal(chipText(spec({ reason: 'no-assignee', assignees: [] })), 'Driver: nobody')
  assert.equal(chipText(spec({ you: true, state: 'driver', reason: 'not-shared', assignees: [] })), 'Driver: you · not shared')
  assert.equal(chipText(null), 'Driver: unknown')
  assert.equal(rowDriverText({ state: 'read-only', reason: 'other-person', assignees: ['octocat'] }), 'Taken by octocat')
  assert.equal(rowDriverText({ state: 'driver', reason: 'driver' }), 'You drive')
  assert.equal(rowDriverText({ state: 'driver', reason: 'not-shared' }), 'Not shared')
  assert.equal(rowDriverText({ state: 'read-only', reason: 'no-assignee' }), 'Nobody drives')
  assert.equal(rowDriverText({ state: 'read-only', reason: 'several', assignees: ['a', 'b'] }), '2 assignees')
  assert.equal(rowDriverText(null), null)
  assert.equal(ago('2026-11-13T09:00:00Z', NOW), '3 h ago')
})

test('the banner says why this machine reads only', () => {
  assert.equal(bannerTitle(spec()), 'Someone else drives this spec')
  assert.equal(bannerTitle(spec({ reason: 'several' })), 'Several assignees')
  assert.equal(bannerTitle(spec({ reason: 'no-assignee' })), 'Nobody drives this spec')
  assert.equal(bannerTitle(spec({ reason: 'unreadable' })), 'Read only here')
})

test('This computer: an optional label of at most 40 characters with no slash', () => {
  assert.deepEqual(toMachineSettings({ label: ' laptop ' }).input, { label: 'laptop' })
  assert.deepEqual(toMachineSettings({ label: '' }).input, { label: null })
  assert.match(toMachineSettings({ label: 'a/b' }).error, /slash/)
  assert.match(toMachineSettings({ label: 'x'.repeat(41) }).error, /40/)
})

test('the pieces are wired: spec page and Settings, with no hand off or take over', () => {
  const app = source('App.tsx'),
    plans = source('PlansView.tsx'),
    settings = source('SettingsView.tsx'),
    driver = source('Driver.tsx')
  // The read-only notice lives on the spec only; no header badge (owner, 2026-11-14).
  for (const [name, text] of [
    ['App.tsx', app],
    ['Driver.tsx', driver],
  ])
    assert.doesNotMatch(text, /DriverSummary|data-driver-summary|specs read only here/, name)
  assert.match(plans, /<DriverChip spec=\{driver\.spec\} \/>/)
  assert.match(plans, /<DriverBanner spec=\{driver\.spec\} \/>/)
  assert.match(settings, /<ThisComputer workspaceId=\{workspaceId\} \/>/)
  // Reassigning the spec issue on GitHub is the handoff; the banner links it.
  assert.match(driver, /Spec issue #\{spec\.issue\?\.number\}/)
  for (const text of [plans, driver]) assert.doesNotMatch(text, /HandOff|Take over|takeover|Force take over/)
})

// The spec driver on the page (R66.17, R116, design §6.10 and §4.44): the
// chip's and the Specs row's words, the banner's reason and button, the
// confirm checks, This computer's form, and where each piece is wired.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ago, bannerAction, bannerTitle, chipText, forceReady, rowDriverText, setupText, toMachineSettings } from '../src/driver-api.ts'

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
  driver: { login: 'octocat', label: 'laptop', machine: 'mch_aaaaaaaaaaaaaaaa' },
  offer: 'force',
  seenAt: '2026-11-13T11:56:00Z',
  stale: false,
  away: [],
  setup: [],
  ...patch,
})

test('the chip says you, or who has the spec by its assignee and when it was seen', () => {
  assert.equal(chipText(spec({ you: true, state: 'driver', reason: 'driver' }), NOW), 'Driver: you')
  assert.equal(chipText(spec({ you: true, state: 'driver', reason: 'not-shared' }), NOW), 'Driver: you · not shared')
  assert.equal(chipText(spec(), NOW), 'Taken by octocat · laptop · seen 4 min ago')
  assert.equal(chipText(spec({ stale: true }), NOW), 'Taken by octocat · laptop · not seen since 2026-11-13T11:56:00Z')
  // A claim another login wrote is the old driver's: only the assignee shows.
  assert.equal(chipText(spec({ assignees: ['bob'] }), NOW), 'Taken by bob')
  assert.equal(chipText(spec({ reason: 'other-machine', offer: 'takeover' }), NOW), 'Driver: octocat · laptop · seen 4 min ago')
  assert.equal(chipText(spec({ reason: 'several', assignees: ['a', 'b'] }), NOW), 'Driver: nobody · 2 assignees')
  assert.equal(chipText(spec({ reason: 'no-assignee', assignees: [] }), NOW), 'Driver: nobody')
  assert.equal(chipText(spec({ mode: 'local', driver: { label: 'desk', machine: 'mch_x' } }), NOW), 'Driver: desk · this file')
  assert.equal(ago('2026-11-13T09:00:00Z', NOW), '3 h ago')
})

test('the Specs row says who has each spec, from its assignee', () => {
  const row = (reason, extra = {}) => rowDriverText({ mode: 'github', state: 'read-only', reason, assignees: [], ...extra })
  assert.equal(row('driver', { state: 'driver', assignees: ['me'] }), 'You drive')
  assert.equal(row('not-shared', { state: 'driver' }), 'Not shared')
  assert.equal(row('other-person', { assignees: ['bob'] }), 'Taken by bob')
  assert.equal(row('several', { assignees: ['a', 'b'] }), '2 assignees')
  assert.equal(row('no-assignee'), 'Nobody drives')
  assert.equal(row('other-machine', { assignees: ['me'] }), 'Your other machine')
  assert.equal(row('handed-off'), 'Handed off')
  assert.equal(row('unreadable'), null)
  assert.equal(rowDriverText(undefined), null)
})

test('the banner says why, and offers Take over when nobody or you are assigned and Force take over otherwise', () => {
  assert.equal(bannerTitle(spec()), 'Someone else drives this spec')
  assert.equal(bannerTitle(spec({ reason: 'other-machine' })), 'Your other machine drives this spec')
  assert.equal(bannerTitle(spec({ reason: 'several' })), 'Several assignees')
  assert.equal(bannerTitle(spec({ reason: 'no-assignee' })), 'Nobody drives this spec')
  assert.equal(bannerTitle(spec({ reason: 'forced-away' })), 'Taken over by force')
  assert.equal(bannerAction(spec()), 'force')
  assert.equal(bannerAction(spec({ reason: 'other-machine', offer: 'takeover' })), 'takeover')
  assert.equal(bannerAction(spec({ reason: 'no-assignee', offer: 'takeover' })), 'takeover', 'Take over assigns you')
  assert.equal(bannerAction(spec({ reason: 'several' })), null, 'no button while several are assigned')
  assert.equal(bannerAction(spec({ reason: 'handed-off' })), null)
  assert.equal(bannerAction(spec({ mode: 'local', reason: 'local-other-machine', offer: 'takeover' })), 'takeover')
  assert.equal(bannerAction(spec({ you: true, state: 'driver' })), null)
})

test('Force take over needs the typed spec name and the loss acknowledged or an export', () => {
  assert.equal(forceReady(spec(), 's', false, ''), 'Type s1 to confirm.')
  assert.match(forceReady(spec(), 's1', false, ''), /without an export loses/)
  assert.equal(forceReady(spec(), 's1', true, ''), null)
  assert.equal(forceReady(spec(), ' s1 ', false, '/tmp/s1.avoozl-driver.json'), null)
  assert.match(forceReady(spec(), 's1', false, 'relative.json'), /full path/)
  assert.equal(forceReady(spec(), 's1', false, 'C:\\exports\\s1.avoozl-driver.json'), null)
})

test('This computer: an optional label and heartbeat minutes from 5 to 60', () => {
  assert.deepEqual(toMachineSettings({ label: ' laptop ', heartbeat: '' }).input, { label: 'laptop', heartbeatMinutes: null })
  assert.deepEqual(toMachineSettings({ label: '', heartbeat: '30' }).input, { label: null, heartbeatMinutes: 30 })
  assert.match(toMachineSettings({ label: 'a/b', heartbeat: '' }).error, /slash/)
  assert.match(toMachineSettings({ label: '', heartbeat: '4' }).error, /5 to 60/)
  assert.match(toMachineSettings({ label: 'x'.repeat(41), heartbeat: '' }).error, /40/)
  assert.match(setupText({ kind: 'plugin', id: 'p' }), /Approve plugin p/)
})

test('the pieces are wired: spec page, Hand off, dialogs and Settings', () => {
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
  assert.match(plans, /<DriverBanner workspaceId=\{workspace\} spec=\{driver\.spec\}/)
  assert.match(plans, /<HandOffButton workspaceId=\{workspace\} spec=\{driver\.spec\} onChanged=\{driver\.reload\} \/>/)
  // Each Specs row says who has the spec (R116.11).
  assert.match(plans, /data-spec-driver=\{row\.driver\?\.reason\}/)
  assert.match(settings, /<ThisComputer workspaceId=\{workspaceId\} \/>/)
  // Hand off is stepped: drain, export, reassign; Avoozl unassigns you,
  // and Release stops driving with no export (R116.5, R116.6).
  for (const step of ['1. Drain', '2. Export', '3. Reassign']) assert.ok(driver.includes(step), step)
  assert.match(driver, /Export with \$\{running\.length\} unfinished/)
  assert.match(driver, /Avoozl unassigns you on the spec issue once the export is written/)
  assert.match(driver, /'release'\), props\.onClose\)/)
  assert.doesNotMatch(driver, /Avoozl does not reassign it/)
  // Force take over names the old driver and needs the spec name typed.
  assert.match(driver, /<Hint as="dt">Assigned to<\/Hint>/)
  assert.match(driver, /Driving machine<\/Hint>/)
  assert.match(driver, /Last heartbeat<\/Hint>/)
  assert.match(driver, /may still be running chats for this spec/)
  assert.match(driver, /Type <code>\{spec\.spec\}<\/code> to confirm/)
  // This computer shows the machine ID small and says the values stay here.
  assert.match(driver, /Machine ID <code>\{machine\.id\}<\/code>/)
  assert.match(driver, /These stay on this machine/)
  assert.match(driver, /placeholder=\{String\(HEARTBEAT_PLACEHOLDER\)\}/)
})

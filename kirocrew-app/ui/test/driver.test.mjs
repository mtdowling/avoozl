// The spec driver on the page (R66.17, design §6.10): the chip's words,
// the banner's reason and button, the confirm checks, This computer's form,
// and where each piece is wired.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ago, bannerAction, bannerTitle, chipText, forceReady, setupText, toMachineSettings } from '../src/driver-api.ts'

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

test('the chip says you, or who drives and when it was seen', () => {
  assert.equal(chipText(spec({ you: true, state: 'driver', reason: 'driver' }), NOW), 'Driver: you')
  assert.equal(chipText(spec(), NOW), 'Driver: octocat · laptop · seen 4 min ago')
  assert.equal(chipText(spec({ stale: true }), NOW), 'Driver: octocat · laptop · not seen since 2026-11-13T11:56:00Z')
  assert.equal(chipText(spec({ reason: 'several' }), NOW), 'Driver: nobody')
  assert.equal(chipText(spec({ mode: 'local', driver: { label: 'desk', machine: 'mch_x' } }), NOW), 'Driver: desk · this file')
  assert.equal(ago('2026-11-13T09:00:00Z', NOW), '3 h ago')
})

test('the banner says why, and offers Take over to the assignee and Force take over otherwise', () => {
  assert.equal(bannerTitle(spec()), 'Assigned to someone else')
  assert.equal(bannerTitle(spec({ reason: 'other-machine' })), 'Your other machine drives this spec')
  assert.equal(bannerTitle(spec({ reason: 'several' })), 'No single assignee')
  assert.equal(bannerTitle(spec({ reason: 'forced-away' })), 'Taken over by force')
  assert.equal(bannerAction(spec()), 'force')
  assert.equal(bannerAction(spec({ reason: 'other-machine', offer: 'takeover' })), 'takeover')
  assert.equal(bannerAction(spec({ reason: 'no-assignee' })), null, 'no button while nobody single is assigned')
  assert.equal(bannerAction(spec({ reason: 'handed-off' })), null)
  assert.equal(bannerAction(spec({ mode: 'local', reason: 'local-other-machine', offer: 'takeover' })), 'takeover')
  assert.equal(bannerAction(spec({ you: true, state: 'driver' })), null)
})

test('Force take over needs the typed spec name and the loss acknowledged or an export', () => {
  assert.equal(forceReady(spec(), 's', false, ''), 'Type s1 to confirm.')
  assert.match(forceReady(spec(), 's1', false, ''), /what a rebuild loses/)
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

test('the pieces are wired: header, spec page, Hand off, dialogs and Settings', () => {
  const app = source('App.tsx'),
    plans = source('PlansView.tsx'),
    settings = source('SettingsView.tsx'),
    driver = source('Driver.tsx')
  assert.match(app, /<DriverSummary workspaceId=\{active\} \/>/)
  assert.match(plans, /<DriverChip spec=\{driver\.spec\} \/>/)
  assert.match(plans, /<DriverBanner workspaceId=\{workspace\} spec=\{driver\.spec\}/)
  assert.match(plans, /<HandOffButton workspaceId=\{props\.workspaceId\}/)
  assert.match(settings, /\{tab === 'github' && <ThisComputer workspaceId=\{workspaceId\} \/>\}/)
  // Hand off is stepped: drain, export, reassign; Avoozl never reassigns.
  for (const step of ['1. Drain', '2. Export', '3. Reassign']) assert.ok(driver.includes(step), step)
  assert.match(driver, /Export with \$\{running\.length\} unfinished/)
  assert.match(driver, /Reassign it on GitHub/)
  assert.match(driver, /Avoozl does not reassign it/)
  // Force take over names the old driver and needs the spec name typed.
  assert.match(driver, /Assigned to<\/dt>/)
  assert.match(driver, /Driving machine<\/dt>/)
  assert.match(driver, /Last heartbeat<\/dt>/)
  assert.match(driver, /may still be running chats for this spec/)
  assert.match(driver, /Type <code>\{spec\.spec\}<\/code> to confirm/)
  // This computer shows the machine ID small and says the values stay here.
  assert.match(driver, /Machine ID <code>\{status\.machine\.id\}<\/code>/)
  assert.match(driver, /These stay on this machine/)
  assert.match(driver, /placeholder=\{String\(HEARTBEAT_PLACEHOLDER\)\}/)
})

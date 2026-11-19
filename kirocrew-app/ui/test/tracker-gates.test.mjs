// Tracker gates on the page (radar-coder RC23.11, RC23.12): the Release queue
// list with its fields, the Waiting on you filter, and the client calls.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { clearable, releaseClient, waitingGates } from '../src/release-api.ts'
import { noActionReason, whyLine } from '../src/conflicts-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const row = (state, extra = {}) => ({ taskId: 'sdk.1', state, needsYou: false, held: [], ...extra })

test('the client reads gate.list and clears with a reason', async () => {
  const calls = []
  const client = releaseClient({ post: async (path, body) => (calls.push([body.operation, body.input]), { result: { gates: [] } }) })
  await client.gates('w')
  await client.clearGate('w', 'sdk.1', 'Shipped by hand')
  assert.deepEqual(calls, [
    ['gate.list', {}],
    ['gate.clear', { taskId: 'sdk.1', reason: 'Shipped by hand' }],
  ])
})

test('Waiting on you lists only failed or twice-unknown gates; Clear is for open ones', () => {
  const rows = [row('open'), row('failed', { needsYou: true }), row('unknown'), row('cleared')]
  assert.deepEqual(
    waitingGates(rows).map((r) => r.state),
    ['failed'],
  )
  assert.deepEqual(rows.map(clearable), [true, true, true, false])
})

test('the Dashboard mounts the list, and a gate row words itself', () => {
  assert.match(source('DashboardView.tsx'), /<TrackerGates workspaceId=\{workspaceId\} \/>/)
  assert.match(source('TrackerGates.tsx'), /<SectionHeading title="Tracker gates"/)
  const item = { kind: 'needs-human', reason: 'tracker-gate', taskId: 'sdk.1', authority: 'github', detail: 'Rejected.' }
  assert.equal(whyLine(item), 'Rejected.')
  assert.match(noActionReason(item), /Clear the gate/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the tracker gates page test'
let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness()
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

test('at 320 px an open, a failed and a cleared gate show their fields without sideways scroll', { skip }, async () => {
  await page.open(harness.url({ page: 'tracker-gates' }), { width: 320, height: 900, dark: false })
  await page.until(`document.querySelectorAll('[data-gate]').length === 3`)
  const seen = await page.evaluate(`(() => {
    const by = (state) => document.querySelector('[data-gate="' + state + '"]')
    return {
      open: by('open').textContent,
      failed: by('failed').textContent,
      cleared: by('cleared').textContent,
      clearButtons: [...document.querySelectorAll('[data-gate] button')].map((b) => b.closest('[data-gate]').dataset.gate),
      waiting: document.querySelector('[data-waiting]').textContent,
      wide: document.documentElement.scrollWidth <= innerWidth,
    }
  })()`)
  assert.match(seen.open, /ticket-tracker · REV-1 · done when the review shipped/)
  assert.match(seen.open, /Last check .* next /)
  assert.match(seen.open, /Holds sdk\.2/)
  assert.match(seen.failed, /Rejected by the owner/)
  assert.match(seen.failed, /Open in the tracker/)
  assert.match(seen.cleared, /Cleared by alice \(command\)/)
  assert.deepEqual(seen.clearButtons.sort(), ['failed', 'open'])
  assert.equal(seen.waiting, 'sdk.5')
  assert.equal(seen.wide, true)
  assert.deepEqual(page.errors, [])
})

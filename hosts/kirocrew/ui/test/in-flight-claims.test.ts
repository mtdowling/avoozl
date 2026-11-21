// In flight's claim branches and lanes (simplify §D13, §D22.3), in a real
// Chrome (harness ?page=app&claims=1): each claim's holder, head and age,
// a stale one marked, and each lane's role, state and Open or copy action.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { specIssuesInput } from '../src/settings-api.ts'
import { findChrome, type Harness, type Page } from './browser/chrome.ts'
import { withChrome } from './browser/harness-page.ts'
import { inFlight } from './browser/in-flight-nav.ts'

test('the Spec issues panel sends labels and stale hours, and blank fields clear them', () => {
  assert.deepEqual(specIssuesInput({ require: 'avoozl, ready', exclude: '', staleHours: '6' }), {
    labels: { require: ['avoozl', 'ready'] },
    claims: { staleHours: 6 },
  })
  assert.deepEqual(specIssuesInput({ require: '', exclude: '', staleHours: '' }), { labels: null, claims: null })
  // Not a whole number: sent as typed, so the backend names the setting.
  assert.deepEqual(specIssuesInput({ require: '', exclude: 'wip', staleHours: '1.5' }).claims, { staleHours: '1.5' })
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the In flight claims browser test'
let harness: Harness, page: Page
withChrome(chrome, (got) => ({ harness, page } = got))

test('In flight lists each claim branch and each lane', { skip }, async () => {
  await page.open(harness.url({ page: 'app', claims: '1' }), { width: 1280, height: 900 })
  await inFlight(page)
  await page.until(`document.querySelectorAll('[data-claim-row]').length === 2 && document.querySelectorAll('[data-lane-row]').length === 3`, 30000)
  const claims = await page.evaluate<string[]>(`[...document.querySelectorAll('[data-claim-row]')].map((row) => row.textContent)`)
  assert.match(claims[0], /Claimed.*Task a1.*this runner · acme\/recipe-box · head a1b2c3d · 2 h old/)
  assert.match(claims[1], /Stale.*Task a2.*another runner.*30 h old/)
  const lanes = await page.evaluate<{ text: string; open: boolean; copy: boolean }[]>(
    `[...document.querySelectorAll('[data-lane-row]')].map((row) => ({ text: row.textContent, open: Boolean(row.querySelector('[data-lane-open]')), copy: Boolean(row.querySelector('[data-copy-attach]')) }))`,
  )
  assert.deepEqual(
    lanes.map((lane) => [lane.open, lane.copy]),
    [
      [true, false],
      [false, true],
      [false, false],
    ],
    'a chat lane opens, a process lane copies, a paused lane says how to resume',
  )
  assert.match(lanes[2].text, /Resume in Needs you/)
})

// The waiting-on-tracker label field (RC23.4): in the Avoozl labels box with
// its default as the placeholder, and a set name round-trips.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { AVOOZL_LABELS, RADAR_DEFAULTS_SHOWN, toForm, toPolicy } from '../src/settings-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

test('the field has its raw key, default and writer', () => {
  const entry = AVOOZL_LABELS.find((row) => row.key === 'trackerLabel')
  assert.equal(entry.raw, 'radar.trackerLabel')
  assert.equal(RADAR_DEFAULTS_SHOWN.trackerLabel, 'avoozl:waiting-on-tracker')
  assert.match(entry.writer, /Avoozl/)
})

test('an unset field writes nothing, and a set name round-trips', () => {
  const base = { baseBranch: 'main', managedLabels: { ready: 'go' } }
  const blank = toPolicy(toForm({ mode: 'single-repo', repositories: { 'example/code': base } }))
  assert.equal(blank.repositories['example/code'].radar, undefined)
  const set = toPolicy(toForm({ mode: 'single-repo', repositories: { 'example/code': { ...base, radar: { trackerLabel: 'waits' } } } }))
  assert.deepEqual(set.repositories['example/code'].radar, { trackerLabel: 'waits' })
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the tracker label page test'
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

test('the page shows the field with its default at 320 px', { skip }, async () => {
  await page.open(harness.url({ page: 'crews-rules' }), { width: 320, height: 900, dark: false })
  await page.until(`document.querySelectorAll('[data-avoozl-labels]').length === 1`)
  await page.evaluate(`document.querySelector('[data-fold]').open = true`)
  const shown = await page.evaluate(`(() => {
    const input = document.querySelector('[data-avoozl-labels] input[id$="-label-trackerLabel"]')
    return input && { placeholder: input.placeholder, value: input.value, wide: document.documentElement.scrollWidth <= innerWidth }
  })()`)
  assert.ok(shown, 'no tracker label input')
  assert.match(shown.placeholder, /avoozl:waiting-on-tracker/)
  assert.equal(shown.wide, true, `no sideways scroll: ${(await page.overflow()).join('; ')}`)
  assert.deepEqual(page.errors, [])
})

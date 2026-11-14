// The Radar values screen (radar-coder RC7.2, RC7.3): every value has Copy,
// a granted read ticks what Radar confirms, no grant leaves checkboxes marked
// "Cannot verify", and the screen fits at 320, 768 and 1280 px.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { progressLine, rowState } from '../src/radar-values-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const item = (status, id = 'a') => ({ id, label: id, value: 'v', controls: 'c', status, note: 'n' })

test('a confirmed item is a locked tick, a mismatch is unticked, an unreadable one is the person\'s', () => {
  assert.deepEqual(rowState(item('ok'), false), { checked: true, locked: true, badge: 'Confirmed by Issue Radar' })
  assert.deepEqual(rowState(item('differs'), true), { checked: false, locked: true, badge: 'Differs in Issue Radar' })
  assert.deepEqual(rowState(item('cannot-verify'), true), { checked: true, locked: false, badge: 'Cannot verify' })
  assert.deepEqual(rowState(item('cannot-verify'), false), { checked: false, locked: false, badge: 'Cannot verify' })
})

test('the progress line counts confirmed and ticked items', () => {
  const items = [item('ok', 'a'), item('differs', 'b'), item('cannot-verify', 'c'), item('cannot-verify', 'd')]
  assert.equal(progressLine(items, new Set()), '1 of 4 done')
  assert.equal(progressLine(items, new Set(['c', 'b'])), '2 of 4 done')
})

test('the screen shows Copy on every row, links to Radar and writes nothing', () => {
  const screen = readFileSync(new URL('../src/RadarValues.tsx', import.meta.url), 'utf8')
  assert.match(screen, /<CopyBtn text=\{item\.value\}/)
  assert.match(screen, /data-radar-link/)
  assert.doesNotMatch(screen, /confirm: true|radar\.setup/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Radar values page tests'
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

for (const width of [320, 768, 1280])
  for (const grant of [true, false])
    test(`at ${width} px ${grant ? 'with' : 'without'} the grant every value has Copy and nothing runs off the page`, { skip }, async () => {
      await page.open(harness.url({ page: 'radar-values', grant: grant ? '1' : '0' }), { width, height: 900, dark: false })
      await page.until(`document.querySelectorAll('[data-radar-value]').length === 4`)
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-radar-value] [data-copy]').length`), 4)
      const marks = JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('[data-radar-value]')].map((el) => [el.dataset.radarValue, el.querySelector('input').checked, el.querySelector('input').disabled]))`))
      if (grant) assert.deepEqual(marks, [['repository', true, true], ['agent', true, true], ['scope', false, true], ['prompt', false, false]])
      else assert.ok(marks.every(([, checked, locked]) => !checked && !locked), 'every box is the person\'s to tick')
      assert.match(await page.evaluate(`document.querySelector('[data-radar-mode]').textContent`), grant ? /Read from Issue Radar/ : /cannot read Issue Radar/)
      // The long prompt wraps; the page never scrolls sideways.
      assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
      assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-radar-value]')].every((el) => el.getBoundingClientRect().right <= innerWidth)`), true)
      assert.deepEqual(page.errors, [])
    })

test('ticking a "cannot verify" box moves the progress line', { skip }, async () => {
  await page.open(harness.url({ page: 'radar-values', grant: '0' }), { width: 768, height: 900, dark: false })
  await page.until(`document.querySelectorAll('[data-radar-value]').length === 4`)
  assert.equal(await page.evaluate(`document.querySelector('[data-progress]').textContent`), '0 of 4 done')
  await page.evaluate(`document.querySelector('[data-radar-value="agent"] input').click()`)
  await page.until(`document.querySelector('[data-progress]').textContent === '1 of 4 done'`)
})

// rc-8.2 in a real Chrome (test/browser/harness.tsx ?page=app&radar=1): a row's
// Trace opens a drawer, Open page shows the page, and Back returns; the page
// also opens from a ?trace= link. The claim marker's updated= (09:46) is
// ahead of GitHub's claim time (09:21) and the page shows GitHub's. Skipped
// when no Chrome is found; set AVOOZL_CHROME to run it.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the trace page test'

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

const byText = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
// The row's own Trace button, not the nav tab of the same name.
const row = `document.querySelector('button[aria-label^="Trace issue"]')`
const times = `[...document.querySelectorAll('[data-trace-step]')].map((s) => s.dataset.traceStep + ' ' + s.querySelector('[data-trace-time]').textContent)`
const back = `document.querySelector('[data-avoozl-app]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }))`

test('a row opens the Trace drawer, Open page shows the page, and Back returns to the Dashboard', { skip }, async () => {
  await page.open(harness.url({ page: 'app', radar: '1' }), { width: 1280, height: 800 })
  await page.until(`Boolean(${row})`)
  await page.evaluate(`${row}.click()`)
  await page.until(`Boolean(document.querySelector('[data-trace-drawer] [data-trace-step]'))`)
  const steps = await page.evaluate(times)
  assert.equal(steps.length, 8)
  assert.ok(steps.includes('claimed Mon 09:21 UTC'), steps.join('; '))
  assert.equal(await page.evaluate(`document.body.textContent.includes('09:46')`), false)
  await page.evaluate(`${byText('button', 'Open page')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-trace-page] [data-trace-step]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-trace-drawer]'))`), false)
  await page.evaluate(back)
  await page.until(`Boolean(${row}) && !document.querySelector('[data-trace-page]')`)
})

test('the page opens from a ?trace= link and Back returns to the Dashboard', { skip }, async () => {
  await page.open(harness.url({ page: 'app', radar: '1', trace: 'acme/recipe-box#52' }), { width: 375, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-trace-page] [data-trace-step]'))`)
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth > document.documentElement.clientWidth`), false, 'no sideways scroll at 375px')
  await page.evaluate(back)
  await page.until(`!document.querySelector('[data-trace-page]')`)
})

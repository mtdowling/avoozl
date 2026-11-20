// Home's Landing queue tile opens Dashboards › Landing queue, not Delivery.
// In a real Chrome (AVOOZL_CHROME, or an installed Chrome or Chromium) on the
// full app harness. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Home tile test'
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

test('the Landing queue tile opens the Landing queue page', { skip }, async () => {
  await page.open(harness.url({ page: 'app', home: '1', landing: '1' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-home-tile="landing"]'))`, 15000)
  await page.evaluate(`document.querySelector('[data-home-tile="landing"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-landing-queue]'))`, 15000)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-home]'))`), false, 'Home is gone')
  assert.equal(await page.evaluate(`document.querySelector('#avoozl-landing-title')?.textContent.trim()`), 'Landing queue')
})

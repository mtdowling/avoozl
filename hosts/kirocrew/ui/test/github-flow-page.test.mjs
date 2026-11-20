// Flow's Builds in a real Chrome (harness ?page=github-flow): the builds
// line and no sideways scroll at 320 px.
// Skipped when no Chrome is found; set AVOOZL_CHROME to run it.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the GitHub flow test'
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

test('Builds shows the builds line, with no sideways scroll', { skip }, async () => {
  for (const width of [320, 768, 1280]) {
    await page.open(harness.url({ page: 'github-flow' }), { width, height: 800 })
    await page.until(`Boolean(document.querySelector('[data-flow-builds]'))`)
    const text = await page.evaluate(`document.querySelector('[data-github-flow]').textContent`)
    assert.match(text, /12 pull requests/)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth > document.documentElement.clientWidth`), false, `no sideways scroll at ${width}px`)
  }
})

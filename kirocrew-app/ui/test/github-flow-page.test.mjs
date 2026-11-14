// rc-8.4 in a real Chrome (harness ?page=github-flow): four stage rows with the
// slowest marked, the skipped issue named, and no sideways scroll at 320 px.
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

test('the GitHub flow section shows the four stages and what was left out', { skip }, async () => {
  for (const width of [320, 768, 1280]) {
    await page.open(harness.url({ page: 'github-flow' }), { width, height: 800 })
    await page.until(`document.querySelectorAll('[data-flow-stage]').length === 4`)
    const text = await page.evaluate(`document.querySelector('[data-github-flow]').textContent`)
    assert.match(text, /2 issues · median lead time 1 h 45 min · flow efficiency 43%/)
    assert.match(text, /Left out for a missing or unordered time: #61/)
    assert.equal(await page.evaluate(`document.querySelector('[data-flow-stage="Claim to PR"]').textContent.includes('Slowest')`), true)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth > document.documentElement.clientWidth`), false, `no sideways scroll at ${width}px`)
  }
})

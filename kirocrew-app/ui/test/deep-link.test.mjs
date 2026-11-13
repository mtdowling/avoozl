// Deep links into a tab's inner view, in a real Chrome on the whole page
// (test/browser/harness.tsx ?page=app). Specs' Ideas button opens Intake on
// its Ideas view, and Back returns to Specs. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the deep link test'

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

const button = (role, text) => `[...document.querySelectorAll('button${role ? `[role="${role}"]` : ''}')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
const selectedTab = `document.querySelector('[aria-label="Avoozl views"] [aria-selected="true"]')?.textContent.trim()`

test("Specs' Ideas button opens Intake on Ideas; Back returns to Specs", { skip }, async () => {
  await page.open(harness.url({ page: 'app' }), { width: 1280, height: 800 })
  await page.until(`Boolean(${button('tab', 'Specs')})`)
  await click(button('tab', 'Specs'))
  await page.until(`Boolean(${button('', 'Ideas')})`)
  await click(button('', 'Ideas'))

  await page.until(`Boolean(document.querySelector('[data-ideas-view]'))`)
  assert.equal(await page.evaluate(selectedTab), 'Intake')
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="Show"] [aria-selected="true"]')?.textContent.trim()`), 'Ideas (1)')

  // Alt+Left from inside the page is Back.
  await page.evaluate(`document.querySelector('[data-ideas-view]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }))`)
  await page.until(`${selectedTab} === 'Specs'`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-ideas-view]'))`), false)
  assert.deepEqual(page.errors, [])
})

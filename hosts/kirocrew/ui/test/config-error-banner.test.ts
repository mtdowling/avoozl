// @ts-nocheck: typing debt
// A workspace whose .avoozl.json does not load: the page shows the
// configuration's own refusal as a banner on every tab, and a valid one shows
// none. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { findChrome, startChrome, stopChrome } from './browser/chrome.ts'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the config error banner test'
let harness, browser, page
before(async () => {
  if (!skip) ({ harness, browser, page } = await startChrome(chrome))
})
after(() => stopChrome(browser, harness))

const banners = `[...document.querySelectorAll('[data-shell-error]')].map((el) => el.textContent)`

test('a workspace whose configuration does not load shows its error as a banner', { skip }, async () => {
  await page.open(harness.url({ page: 'app', configError: '1' }), { width: 1280, height: 800 })
  await page.until(`${banners}.length > 0`)
  const [text] = await page.evaluate(banners)
  assert.match(text, /Unknown setting "github\.repositories\.example\/app\.role" in repository Avoozl configuration at \/w\/\.avoozl\.json\. Remove it\./)
  assert.equal(await page.evaluate(`document.querySelector('[data-shell-error]').getAttribute('role')`), 'alert')
})

test('a valid configuration shows no banner', { skip }, async () => {
  await page.open(harness.url({ page: 'app' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  await page.evaluate(`new Promise((r) => setTimeout(r, 400))`)
  assert.deepEqual(await page.evaluate(banners), [])
})

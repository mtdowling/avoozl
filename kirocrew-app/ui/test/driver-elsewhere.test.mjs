// The app page's driver box names its workspace, and when that workspace has
// no driver but another one does, says so with an Open that opens that chat.
// In a real Chrome on the harness Home (?page=home&driver=nupp). Skipped when
// no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the driver box test'
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

for (const width of [1280, 390])
  test(`Home at ${width} px: "No driver for Harness. Nupp has one: Open", and the workspace name`, { skip }, async () => {
    await page.open(harness.url({ page: 'home', theme: 'light', driver: 'nupp' }), { width, height: 900 })
    await page.until(`Boolean(document.querySelector('[data-driver-session="none"] [data-driver-elsewhere]'))`)
    // The compact card's one line carries the workspace; all of it is in the tooltip.
    assert.match(await page.evaluate(`document.querySelector('[data-driver-session] [data-card-line]').textContent`), /Workspace: Harness\./)
    assert.equal(await page.evaluate(`document.querySelector('[data-driver-elsewhere]').textContent.trim()`), 'No driver for Harness. Nupp has one: Open')
    // Open opens the Nupp driver chat itself.
    await page.evaluate(`document.querySelector('[data-driver-elsewhere-open]').click()`)
    assert.deepEqual(await page.evaluate(`window.__chats`), [{ slotKey: 'chat-nupp' }])
  })

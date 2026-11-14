// The instance name in a real Chrome (harness ?page=app): the header shows it
// for one instance and nothing else does; with a second instance In flight
// shows it too; Settings renames it. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the instance test'

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

const open = (query = {}) => page.open(harness.url({ page: 'app', radar: '1', ...query }), { width: 1280, height: 800 })
const tab = (text) => `[...document.querySelectorAll('button[role="tab"]')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`

test('one instance: the name is in the header and on no other surface', { skip }, async () => {
  await open()
  await page.until(`Boolean(document.querySelector('[data-instance-name]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-instance-name]').textContent`), 'Mira')
  await page.until(`document.body.innerText.includes('In flight (')`)
  assert.equal(await page.evaluate(`document.body.innerText.includes('· Mira')`), false)
  assert.deepEqual(page.errors, [])
})

test('two instances: In flight carries the name', { skip }, async () => {
  await open({ shared: '1' })
  await page.until(`document.body.innerText.includes(') · Mira')`)
  assert.deepEqual(page.errors, [])
})

test('Settings has the rename box, and it never shows the ID', { skip }, async () => {
  await open()
  await page.until(`Boolean(${tab('Settings')})`)
  await page.evaluate(`${tab('Settings')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-settings-section="instance"] button'))`)
  await page.evaluate(`document.querySelector('[data-settings-section="instance"] button').click()`)
  await page.until(`Boolean(document.querySelector('[data-instance-rename]'))`)
  assert.equal(await page.evaluate(`document.body.innerText.includes('inst-')`), false)
})

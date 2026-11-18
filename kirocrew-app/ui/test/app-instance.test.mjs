// The instance name in a real Chrome (harness ?page=app): the header shows it
// for one instance and nothing else does; with a second instance In flight
// shows it too; Settings > This computer renames it. Skipped when no Chrome is found.
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
const tab = (text) => `[...document.querySelectorAll('button[data-nav-head]')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`

test('one instance: the name is in the header and on no other surface', { skip }, async () => {
  await open()
  await page.until(`Boolean(document.querySelector('[data-instance-name]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-instance-name]').textContent`), 'Mira')
  await page.until(`document.body.textContent.includes('In flight (')`)
  assert.equal(await page.evaluate(`document.body.textContent.includes('· Mira')`), false)
  assert.deepEqual(page.errors, [])
})

test('two instances: In flight carries the name', { skip }, async () => {
  await open({ shared: '1' })
  await page.until(`document.body.textContent.includes(') · Mira')`)
  assert.deepEqual(page.errors, [])
})

const NAME = `document.querySelector('[data-left-nav] [data-instance-name]').textContent`
const FIELD = `document.querySelector('#avoozl-instance-nickname')`
const type = (text) => `(() => { const i = ${FIELD}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
const SAVE = `document.querySelector('[data-save-footer] [data-save]')`
const openThisComputer = async (query = {}) => {
  await open(query)
  await page.until(`Boolean(${tab('Settings')})`)
  await page.evaluate(`${tab('Settings')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-nav-item="settings/workspaces"]'))`)
  await page.evaluate(`document.querySelector('[data-nav-item="settings/workspaces"]').click()`)
  await page.until(`Boolean(${FIELD})`)
}

test('Settings has no Instance name page, and an old link opens Settings home', { skip }, async () => {
  await open()
  await page.until(`Boolean(${tab('Settings')})`)
  await page.evaluate(`${tab('Settings')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-nav-item="settings/workspaces"]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-nav-item="settings/instance"]'))`), false)
  assert.equal(await page.evaluate(`document.body.innerText.includes('Instance name')`), false)
})

test('the footer shows the name read-only: no edit control', { skip }, async () => {
  await open()
  await page.until(`Boolean(document.querySelector('[data-left-nav] [data-instance-name]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-instance-edit]'))`), false)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-left-nav] [data-brand-card] button'))`), false)
})

test('This computer shows the nickname; Save renames and the footer updates', { skip }, async () => {
  await openThisComputer()
  assert.equal(await page.evaluate(`${FIELD}.value`), 'Mira')
  assert.equal(await page.evaluate(`Boolean(${SAVE})`), false)
  await page.evaluate(type('Juno'))
  await page.until(`Boolean(${SAVE})`)
  await page.evaluate(`${SAVE}.click()`)
  await page.until(`${NAME} === 'Juno'`)
  assert.equal(await page.evaluate(`document.body.innerText.includes('inst-')`), false)
})

test('an invalid nickname shows the rule and cannot be saved; Discard restores it', { skip }, async () => {
  await openThisComputer()
  await page.evaluate(type('bad/name'))
  await page.until(`document.querySelector('[data-instance-nickname]').innerText.includes('1 to 24 letters')`)
  assert.equal(await page.evaluate(`${SAVE}.disabled`), true)
  await page.evaluate(`document.querySelector('[data-save-footer] [data-discard]').click()`)
  await page.until(`${FIELD}.value !== 'bad/name'`)
  assert.equal(await page.evaluate(NAME), await page.evaluate(`${FIELD}.value`))
})

test('a phone menu footer shows the name with no pencil', { skip }, async () => {
  await page.open(harness.url({ page: 'app', radar: '1' }), { width: 390, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
  await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await page.until(`Boolean(document.querySelector('[data-top-rail-footer] [data-instance-name]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-instance-edit]'))`), false)
})

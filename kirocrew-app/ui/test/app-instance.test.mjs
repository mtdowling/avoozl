// The instance name in a real Chrome (harness ?page=app): the header shows it
// for one instance and nothing else does; with a second instance In flight
// shows it too; the nav footer's modal renames it. Skipped when no Chrome is found.
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
  await page.until(`document.body.innerText.includes('In flight (')`)
  assert.equal(await page.evaluate(`document.body.innerText.includes('· Mira')`), false)
  assert.deepEqual(page.errors, [])
})

test('two instances: In flight carries the name', { skip }, async () => {
  await open({ shared: '1' })
  await page.until(`document.body.innerText.includes(') · Mira')`)
  assert.deepEqual(page.errors, [])
})

const NAME = `document.querySelector('[data-left-nav] [data-instance-name]').textContent`
const MODAL = `document.querySelector('[data-modal="avoozl-instance-name"]')`
const type = (text) => `(() => { const i = ${MODAL}.querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })) })()`
const openModal = async () => {
  await open()
  await page.until(`Boolean(document.querySelector('[data-left-nav] [data-instance-edit]'))`)
  await page.evaluate(`document.querySelector('[data-left-nav] [data-instance-edit]').click()`)
  await page.until(`Boolean(${MODAL})`)
}

test('Settings has no Instance name page, and an old link opens Settings home', { skip }, async () => {
  await open()
  await page.until(`Boolean(${tab('Settings')})`)
  await page.evaluate(`${tab('Settings')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-nav-item="settings/workspaces"]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-nav-item="settings/instance"]'))`), false)
  assert.equal(await page.evaluate(`document.body.innerText.includes('Instance name')`), false)
})

test('the footer pencil opens the modal; Save persists and the footer shows it', { skip }, async () => {
  await openModal()
  assert.equal(await page.evaluate(`document.querySelector('[data-instance-edit]').getAttribute('aria-label')`), 'Edit instance name')
  await page.evaluate(type('Juno'))
  await page.evaluate(`${MODAL}.querySelector('[data-modal-footer] button[type=submit]').click()`)
  await page.until(`!${MODAL}`)
  await page.until(`${NAME} === 'Juno'`)
  assert.equal(await page.evaluate(`document.body.innerText.includes('inst-')`), false)
})

test('an invalid name shows the rule and cannot be saved; Cancel and Esc change nothing', { skip }, async () => {
  await openModal()
  await page.evaluate(type('bad/name'))
  await page.until(`${MODAL}.innerText.includes('1 to 24 letters')`)
  assert.equal(await page.evaluate(`${MODAL}.querySelector('button[type=submit]').disabled`), true)
  await page.evaluate(`[...${MODAL}.querySelectorAll('[data-modal-footer] button')].find((b) => b.textContent.trim() === 'Cancel').click()`)
  await page.until(`!${MODAL}`)
  assert.equal(await page.evaluate(NAME), 'Mira')
  await page.evaluate(`document.querySelector('[data-left-nav] [data-instance-edit]').click()`)
  await page.until(`Boolean(${MODAL})`)
  await page.evaluate(type('Other'))
  await page.key('Escape', 'Escape', 27)
  await page.until(`!${MODAL}`)
  assert.equal(await page.evaluate(NAME), 'Mira')
})

test('Enter saves', { skip }, async () => {
  await openModal()
  await page.evaluate(type('Nova'))
  await page.evaluate(`${MODAL}.querySelector('form').requestSubmit()`)
  await page.until(`${NAME} === 'Nova'`)
})

test('a phone has the pencil in the menu footer', { skip }, async () => {
  await page.open(harness.url({ page: 'app', radar: '1' }), { width: 390, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
  await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await page.until(`Boolean(document.querySelector('[data-top-rail-footer] [data-instance-edit]'))`)
  await page.evaluate(`document.querySelector('[data-top-rail-footer] [data-instance-edit]').click()`)
  await page.until(`Boolean(${MODAL})`)
  assert.equal(await page.evaluate(`${MODAL}.querySelector('input').value`), 'Mira')
})

// The left nav is Issue Radar's accordion: Dashboards, Flow, Needs you and Settings open
// in the nav to their pages, sections stay open until shut, and the content
// shows only the picked page (no tab bar or section list in it). Each pick is
// a Back step. On a phone the same accordion is in the menu. Skipped when no
// Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the nav accordion tests'
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
const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 250))')
const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const has = (selector) => page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)

test('Settings opens in the nav; the page shows one section; Needs you does the same; opened sections stay open', { skip }, async () => {
  await page.open(harness.url({ app: '1', radar: '1' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-nav-group="settings"]'))`)
  // Home is Dashboards' first page, so Dashboards is the one open section.
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-nav-children]')].map((x) => x.dataset.navChildren)`), ['dashboard'], 'every section starts shut except the page you are on')
  await click('[data-nav-group="settings"]')
  await page.until(`Boolean(document.querySelector('[data-nav-children="settings"]'))`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-settings-section]').length`), 1, 'the page shows one section')
  assert.equal(await page.evaluate(`document.querySelector('[data-nav-item="settings/workspaces"]').getAttribute('aria-current')`), 'page')
  await click('[data-nav-item="settings/models"]')
  await page.until(`document.querySelector('[data-settings-section]').dataset.settingsSection === 'models'`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-settings-section]').length`), 1)
  // Opening Needs you leaves Settings open; its two sections are nav pages.
  await click('[data-nav-group="waiting"]')
  await page.until(`Boolean(document.querySelector('[data-nav-children="waiting"]'))`)
  assert.equal(await has('[data-nav-children="settings"]'), true, 'Settings stays open')
  await click('[data-nav-item="waiting/intake"]')
  await page.until(`document.querySelector('[data-waiting-section][data-open="true"]')?.dataset.waitingSection === 'intake'`)
  assert.equal(await has('[data-waiting-tabs]'), false, 'no section tabs in the page')
  // A plain page leaves them open; a header click shuts its section.
  await click('[data-nav-item="trace"]')
  await settle()
  assert.equal(await has('[data-nav-children="waiting"]'), true)
  await click('[data-nav-group="waiting"]')
  await click('[data-nav-group="settings"]')
  await click('[data-nav-group="dashboard"]')
  await settle()
  assert.equal(await has('[data-nav-children]'), false)
  assert.deepEqual(page.errors, [])
})

test('a pick in the nav is a Back step', { skip }, async () => {
  await page.open(harness.url({ app: '1', radar: '1' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-nav-group="settings"]'))`)
  await click('[data-nav-group="settings"]')
  await page.until(`Boolean(document.querySelector('[data-nav-item="settings/models"]'))`)
  await click('[data-nav-item="settings/models"]')
  await page.until(`document.querySelector('[data-settings-section]').dataset.settingsSection === 'models'`)
  await page.evaluate(`document.querySelector('[data-nav-item="settings/models"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true, bubbles: true }))`)
  await page.until(`document.querySelector('[data-settings-section]')?.dataset.settingsSection === 'workspaces'`)
})

test('a phone: the menu holds the same accordion, and picking a page closes the menu', { skip }, async () => {
  await page.open(harness.url({ app: '1', radar: '1' }), { width: 390, height: 844 })
  await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
  await click('[data-top-rail-bar]')
  await page.until(`Boolean(document.querySelector('[data-top-rail-list] [data-nav-group="settings"]'))`)
  await click('[data-nav-group="settings"]')
  await page.until(`Boolean(document.querySelector('[data-nav-children="settings"]'))`)
  await click('[data-nav-group="waiting"]')
  await page.until(`Boolean(document.querySelector('[data-nav-children="waiting"]'))`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-nav-section][data-open]').length`), 3, 'Dashboards, Settings and Needs you are open')
  assert.equal(await has('[data-top-rail-footer] [data-brand-card]'), true, 'the brand card is at the bottom of the menu')
  await click('[data-nav-item="waiting/intake"]')
  await settle()
  assert.equal(await has('[data-top-rail-list]'), false, 'the menu closes')
  assert.match(await page.evaluate(`document.querySelector('[data-top-rail-bar]').textContent`), /Needs you · Planning and intake/)
})

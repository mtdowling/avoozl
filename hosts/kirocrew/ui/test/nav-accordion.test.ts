// @ts-nocheck: typing debt
// The left nav is Issue Radar's accordion: Plans, In flight, Needs you and Settings open
// in the nav to their pages, one section is open at a time, and the content
// shows only the picked page (no tab bar or section list in it). Each pick is
// a Back step. On a phone the same accordion is in the menu. Skipped when no
// Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { findChrome, startChrome, stopChrome } from './browser/chrome.ts'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the nav accordion tests'
let harness, browser, page
before(async () => {
  if (!skip) ({ harness, browser, page } = await startChrome(chrome))
})
after(() => stopChrome(browser, harness))
const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 250))')
const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
// The sections drawn open, inside the given nav.
const openPills = (scope) => page.evaluate(`[...document.querySelectorAll(${JSON.stringify(scope + ' [data-nav-section][data-open]')})].map((x) => x.dataset.navSection)`)
const has = (selector) => page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)

test('Settings opens in the nav; the page shows one section; Needs you does the same and shuts Settings', { skip }, async () => {
  await page.open(harness.url({ app: '1', basic: '1' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-nav-group="settings"]'))`)
  // The page opens on Insights, so Insights is the one open section.
  assert.deepEqual(
    await page.evaluate(`[...document.querySelectorAll('[data-nav-children]')].map((x) => x.dataset.navChildren)`),
    ['insights'],
    'every section starts shut except the page you are on',
  )
  await click('[data-nav-group="settings"]')
  await page.until(`Boolean(document.querySelector('[data-nav-children="settings"]'))`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-settings-section]').length`), 1, 'the page shows one section')
  assert.equal(await page.evaluate(`document.querySelector('[data-nav-item="settings/workspaces"]').getAttribute('aria-current')`), 'page')
  await click('[data-nav-item="settings/models"]')
  await page.until(`document.querySelector('[data-settings-section]').dataset.settingsSection === 'models'`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-settings-section]').length`), 1)
  // Opening Needs you shuts Settings; its section is a nav page.
  await click('[data-nav-group="waiting"]')
  await page.until(`Boolean(document.querySelector('[data-nav-children="waiting"]'))`)
  assert.equal(await has('[data-nav-children="settings"]'), false, 'Settings shuts')
  await click('[data-nav-item="waiting/decisions"]')
  await page.until(`document.querySelector('[data-waiting-section][data-open="true"]')?.dataset.waitingSection === 'decisions'`)
  assert.equal(await has('[data-waiting-tabs]'), false, 'no section tabs in the page')
  // A header click on an open section shuts it.
  await click('[data-nav-group="waiting"]')
  await settle()
  assert.equal(await has('[data-nav-children]'), false)
  assert.deepEqual(page.errors, [])
})

test('a pick in the nav is a Back step', { skip }, async () => {
  await page.open(harness.url({ app: '1', basic: '1' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-nav-group="settings"]'))`)
  await click('[data-nav-group="settings"]')
  await page.until(`Boolean(document.querySelector('[data-nav-item="settings/models"]'))`)
  await click('[data-nav-item="settings/models"]')
  await page.until(`document.querySelector('[data-settings-section]').dataset.settingsSection === 'models'`)
  await page.evaluate(
    `document.querySelector('[data-nav-item="settings/models"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true, bubbles: true }))`,
  )
  await page.until(`document.querySelector('[data-settings-section]')?.dataset.settingsSection === 'workspaces'`)
})

test('a phone: the menu holds the same accordion, and picking a page closes the menu', { skip }, async () => {
  await page.open(harness.url({ app: '1', basic: '1' }), { width: 390, height: 844 })
  await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
  await click('[data-top-rail-bar]')
  await page.until(`Boolean(document.querySelector('[data-top-rail-list] [data-nav-group="settings"]'))`)
  await click('[data-nav-group="settings"]')
  await page.until(`Boolean(document.querySelector('[data-nav-children="settings"]'))`)
  await click('[data-nav-group="waiting"]')
  await page.until(`Boolean(document.querySelector('[data-nav-children="waiting"]'))`)
  assert.deepEqual(await openPills('[data-top-rail-list]'), ['waiting'], 'only Needs you is open')
  assert.equal(await has('[data-top-rail-footer] [data-brand-card]'), true, 'the brand card is at the bottom of the menu')
  await click('[data-nav-item="waiting/decisions"]')
  await settle()
  assert.equal(await has('[data-top-rail-list]'), false, 'the menu closes')
  assert.match(await page.evaluate(`document.querySelector('[data-top-rail-bar]').textContent`), /Needs you · Decisions/)
})

// The owner's ask (2026-11-17): moving from page to page leaves only that
// page's pill open, and opening one by hand shuts the rest.
for (const [width, height, scope] of [
  [1280, 800, '[data-left-nav]'],
  [390, 844, '[data-top-rail-list]'],
])
  test(`at ${width} px one pill is open: Insights, then In flight, then Needs you, then a pill opened by hand`, { skip }, async () => {
    await page.open(harness.url({ app: '1', basic: '1', specs: '1' }), { width, height })
    await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
    const menu = async () => {
      if (width >= 768 || (await has('[data-top-rail-list]'))) return
      await click('[data-top-rail-bar]')
      await page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
    }
    const go = async (key) => {
      await menu()
      await click(`${scope} [data-nav-group="${key}"]`)
      await page.until(`Boolean(document.querySelector('${scope} [data-nav-children="${key}"]'))`)
      await settle()
    }
    await menu()
    assert.deepEqual(await openPills(scope), ['insights'], 'Insights alone')
    for (const key of ['delivery', 'activity', 'waiting', 'plans']) {
      await go(key)
      assert.deepEqual(await openPills(scope), [key], `after going to ${key}, only its pill is open`)
    }
    // A page inside a pill keeps that pill the only one open.
    await click(`${scope} [data-nav-group="graph"]`)
    await settle()
    await menu()
    assert.deepEqual(await openPills(scope), ['graph'], 'Graph: its own pill alone')
    await go('settings')
    assert.deepEqual(await openPills(scope), ['settings'], 'opening Settings by hand shuts the rest')
    assert.equal(await page.evaluate(`document.querySelectorAll('${scope} [aria-expanded="true"][data-nav-group]').length`), 1, 'one header says it is expanded')
    assert.deepEqual(page.errors, [])
  })

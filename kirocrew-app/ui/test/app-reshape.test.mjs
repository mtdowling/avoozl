// The reshaped page in a real Chrome (test/browser/harness.tsx ?page=app):
// the nav row, Home's empty states, the Settings hub with the Mirror setup
// buttons, the retired-worker banner, and Needs you
// holding what Conflicts and Intake used to. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the reshape test'

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

const tab = (text) => `[...document.querySelectorAll('button[data-nav-head]')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
const tabs = `[...document.querySelectorAll('button[data-nav-head]')].map((b) => b.textContent.trim().replace(/\\d+$/, ''))`
const open = (query = {}) => page.open(harness.url({ page: 'app', ...query }), { width: 1280, height: 800 })
const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
const text = `document.body.innerText`

test('the nav row has Dashboards, Specs, Needs you, Trace, Flow, Activity and Settings, and no removed page', { skip }, async () => {
  await open({ radar: '1' })
  await page.until(`${tabs}.length === 7`)
  assert.deepEqual(await page.evaluate(tabs), ['Dashboards', 'Specs', 'Needs you', 'Trace', 'Flow', 'Activity', 'Settings'])
  assert.deepEqual(page.errors, [])
})

test('an empty Home says what to set up, with a button for each, instead of hiding cards', { skip }, async () => {
  await open({ radar: '1' })
  await page.until(`Boolean(document.querySelector('[data-release-empty]'))`)
  const body = await page.evaluate(text)
  for (const line of ['No epics', 'Start one with New spec on Specs.', 'Release queue', 'Open Repository setup'])
    assert.ok(body.includes(line), line)
  // No epics has no button of its own, and Radar's crew cell, its wording and
  // its graph link are gone.
  assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-setup-card="epics"] button')].length`), 0, 'no button on No epics')
  for (const gone of ['Plan an epic', 'Radar crew', 'coded by Issue Radar', 'Issue Radar graph', 'driver session']) assert.ok(!body.includes(gone), gone)
  // The driver chat is gone: no driver cell and no Start.
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-driver-session], [data-driver-start]').length`), 0)
  assert.deepEqual(page.errors, [])
})

test('Settings lists its sections in the nav, shows only the picked one, and has the Mirror setup buttons', { skip }, async () => {
  await open({ radar: '1' })
  await page.until(`Boolean(${tab('Settings')})`)
  await click(tab('Settings'))
  await page.until(`Boolean(document.querySelector('[data-settings-section]'))`)
  const sections = await page.evaluate(`[...document.querySelectorAll('[data-nav-children="settings"] [data-nav-item]')].map((s) => s.dataset.navItem.replace('settings/', ''))`)
  assert.deepEqual(sections, ['instance', 'workspaces', 'repositories', 'github', 'plugins', 'content', 'flow', 'models', 'delivery'])
  // Settings opens alone, and the page shows one section.
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-settings-section]').length`), 1)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-nav-section][data-open]').length`), 1)
  // Opening another section in the nav shows that one alone.
  await click(`document.querySelector('[data-nav-item="settings/repositories"]')`)
  // The large editors open in a modal from Configure.
  await page.until(`Boolean(document.querySelector('[data-open-settings="repositories"]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-mirror-setup]'))`), false)
  await click(`document.querySelector('[data-open-settings="repositories"]')`)
  await page.until(`Boolean(document.querySelector('[data-settings-dialog="repositories"] [data-mirror-setup]'))`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-settings-section]').length`), 1)
  const buttons = await page.evaluate(`[...document.querySelectorAll('[data-setup-action]')].map((b) => [b.dataset.setupAction, b.disabled])`)
  // Both buttons wait for the two repository names.
  assert.deepEqual(buttons, [['Adopt existing setup', true], ['Create setup', true]])
  assert.deepEqual(page.errors, [])
})

test('a repository on the retired worker shows the Settings banner; one on Radar does not', { skip }, async () => {
  await open({ radar: '1', worker: '1' })
  await page.until(`Boolean(${tab('Settings')})`)
  await click(tab('Settings'))
  await page.until(`Boolean(document.querySelector('[data-retired-banner]'))`)
  const banner = await page.evaluate(`document.querySelector('[data-retired-banner]').textContent`)
  assert.ok(banner.includes('Local workers are retired. Switch to Issue Radar.'))
  assert.ok(banner.includes('acme/recipe-box'))
  await open({ radar: '1' })
  await page.until(`Boolean(${tab('Settings')})`)
  await click(tab('Settings'))
  await page.until(`Boolean(document.querySelector('[data-settings-section]'))`)
  await page.evaluate('new Promise((r) => setTimeout(r, 300))')
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-retired-banner]'))`), false)
})

test('Needs you holds decisions and intake as two nav pages, one shown at a time', { skip }, async () => {
  await open({ radar: '1' })
  await page.until(`Boolean(${tab('Needs you')})`)
  await click(tab('Needs you'))
  await page.until(`Boolean(document.querySelector('[data-waiting-view]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-waiting-section][data-open="true"]').dataset.waitingSection`), 'decisions')
  await click(`document.querySelector('[data-nav-item="waiting/intake"]')`)
  await page.until(`document.querySelector('[data-waiting-section="intake"]').dataset.open === 'true'`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-waiting-section][data-open="true"]').length`), 1)
  assert.deepEqual(page.errors, [])
})

test('Trace in the nav explains itself and takes an issue', { skip }, async () => {
  await open({ radar: '1' })
  await page.until(`Boolean(${tab('Trace')})`)
  await click(tab('Trace'))
  await page.until(`Boolean(document.querySelector('[data-trace-start]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-trace-start] button[type="submit"]').disabled`), true)
})

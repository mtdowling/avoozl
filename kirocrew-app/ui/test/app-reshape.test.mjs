// The reshaped page in a real Chrome (test/browser/harness.tsx ?page=app):
// the nav row, Home's empty states, the Settings hub with the Mirror setup
// buttons, no retired-worker banner, and Needs you
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

test('the nav row has Dashboards, Specs, Needs you, Flow, Retros, Activity and Settings, and no Trace', { skip }, async () => {
  await open({ basic: '1' })
  await page.until(`${tabs}.length === 8`)
  assert.deepEqual(await page.evaluate(tabs), ['Dashboards', 'Specs', 'Needs you', 'GitHub', 'Flow', 'Retros', 'Activity', 'Settings'])
  assert.deepEqual(page.errors, [])
})

test('an empty Home says what to set up, with a button for each, instead of hiding cards', { skip }, async () => {
  await open({ basic: '1' })
  await page.until(`Boolean(document.querySelector('[data-home-section="landing-queue"]'))`)
  const body = await page.evaluate(text)
  for (const line of ['No epics', 'Start one with New spec on Specs.', 'Landing queue']) assert.ok(body.includes(line), line)
  // No epics has no button of its own, and Radar's crew cell, its wording and
  // its graph link are gone.
  assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-setup-card="epics"] button')].length`), 0, 'no button on No epics')
  for (const gone of ['Plan an epic', 'Radar crew', 'coded by Issue Radar', 'Issue Radar graph', 'driver session']) assert.ok(!body.includes(gone), gone)
  // The driver chat is gone: no driver cell and no Start.
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-driver-session], [data-driver-start]').length`), 0)
  assert.deepEqual(page.errors, [])
})

test('Settings lists its sections in the nav, shows only the picked one, and lists repositories as compact rows', { skip }, async () => {
  await open({ basic: '1' })
  await page.until(`Boolean(${tab('Settings')})`)
  await click(tab('Settings'))
  await page.until(`Boolean(document.querySelector('[data-settings-section]'))`)
  const sections = await page.evaluate(`[...document.querySelectorAll('[data-nav-children="settings"] [data-nav-item]')].map((s) => s.dataset.navItem.replace('settings/', ''))`)
  assert.deepEqual(sections, ['workspaces', 'repositories', 'github', 'plugins', 'content', 'flow', 'models', 'delivery'])
  // Settings opens alone, and the page shows one section.
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-settings-section]').length`), 1)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-nav-section][data-open]').length`), 1)
  // Opening another section in the nav shows that one alone.
  await click(`document.querySelector('[data-nav-item="settings/repositories"]')`)
  // Repository setup edits in place: no Configure button and no dialog.
  await page.until(`Boolean(document.querySelector('[data-repository-list], [data-repositories-empty]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-open-settings], [data-settings-dialog]'))`), false)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-settings-section]').length`), 1)
  // No separate Mirror box: its buttons live in a repository's Edit dialog.
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-mirror-setup], [data-setup-action]'))`), false)
  assert.deepEqual(page.errors, [])
})

test('a repository on the local worker shows no retired banner in Settings', { skip }, async () => {
  await open({ basic: '1', worker: '1' })
  await page.until(`Boolean(${tab('Settings')})`)
  await click(tab('Settings'))
  await page.until(`Boolean(document.querySelector('[data-settings-section]'))`)
  await page.evaluate('new Promise((r) => setTimeout(r, 300))')
  assert.doesNotMatch(await page.evaluate('document.body.textContent'), /Local workers are retired|Switch to Issue Radar/)
})

test('Needs you holds Decisions and From the agent as two nav pages, one shown at a time', { skip }, async () => {
  await open({ basic: '1' })
  await page.until(`Boolean(${tab('Needs you')})`)
  await click(tab('Needs you'))
  await page.until(`Boolean(document.querySelector('[data-waiting-view]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-waiting-section][data-open="true"]').dataset.waitingSection`), 'decisions')
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-nav-children="waiting"] [data-nav-item]')].map((el) => el.dataset.navItem)`), [
    'waiting/decisions',
    'waiting/agent',
  ])
  for (const key of ['agent', 'decisions']) {
    await click(`document.querySelector('[data-nav-item="waiting/${key}"]')`)
    await page.until(`document.querySelector('[data-waiting-section="${key}"]')?.dataset.open === 'true'`)
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-waiting-section][data-open="true"]').length`), 1)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-waiting-line]')?.textContent)`), true, 'one line of description')
  }
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-waiting-section][data-open="true"]').length`), 1)
  assert.deepEqual(page.errors, [])
})

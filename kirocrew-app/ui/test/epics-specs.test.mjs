// The Specs list in a real Chrome, on the real sample (demo mode) for the
// data the backend gives. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Specs list test'

let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({
    scripts: { 'demo.js': demoScript(await demoReplies()) },
  })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const button = (text, role) => `[...document.querySelectorAll('button${role === 'tab' ? '[data-nav-head]' : role ? `[role="${role}"]` : ''}')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
const radio = (name, key) => `document.querySelector('input[name="${name}"][value="${key}"]')`
const open = (query) =>
  page.open(harness.url({ page: 'app', ...query }), {
    width: 1280,
    height: 800,
  })
const specsTab = button('Specs', 'tab')

test('the real sample: Specs is one list with a status chip per spec, and a spec opens beside it', { skip }, async () => {
  await page.open(harness.url({ page: 'demo' }), {
    width: 1280,
    height: 800,
  })
  await page.until(`Boolean(${button('Start demo')})`)
  await click(button('Start demo'))
  await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
  await click(specsTab)
  await page.until(`Boolean(document.querySelector('[data-spec-list] [data-plan-row]'))`)
  const chips = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('[data-spec-list] [data-plan-row]')].map((r) => [r.querySelector('[data-spec-name]').firstChild.textContent, r.dataset.specChip]))`)
  assert.equal(chips['Pantry photos'], 'draft')
  assert.ok(Object.values(chips).every((c) => ['draft', 'approved', 'github', 'done'].includes(c)))
  // The removed blocks are gone.
  for (const gone of ['[data-epics-view]', '[data-epics-unprojected]', '[data-plan-epic]']) assert.equal(await page.evaluate(`Boolean(document.querySelector(${JSON.stringify(gone)}))`), false, gone)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-plans-list-pane] [data-radar-graph]'))`), false, 'no Radar link on the list')
  // A spec opens in the detail column; the list stays on the left.
  await click(`document.querySelector('[data-spec-list] [data-plan-row][data-spec-chip]:not([data-spec-chip="draft"])') || document.querySelector('[data-spec-list] [data-plan-row]')`)
  await page.until(`Boolean(document.querySelector('[data-detail-column="specs"] [data-spec-detail]'))`)
  const list = await page.evaluate(`document.querySelector('[data-list-pane="specs"]').getBoundingClientRect().right`)
  const detail = await page.evaluate(`document.querySelector('[data-detail-column="specs"]').getBoundingClientRect().left`)
  assert.ok(detail >= list, 'detail right of the list')
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-detail-column="specs"] [data-radar-graph]'))`), true, 'the Radar link is in the detail')
  assert.deepEqual(page.errors, [])
})

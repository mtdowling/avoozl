// The Specs list and Trace's Done work in a real Chrome: the harness's own
// answers for the empty and full cases, and the real sample (demo mode) for
// the data the backend gives. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the epics and trace test'

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

const button = (text, role) => `[...document.querySelectorAll('button${role ? `[role="${role}"]` : ''}')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
const radio = (name, key) => `document.querySelector('input[name="${name}"][value="${key}"]')`
const open = (query) =>
  page.open(harness.url({ page: 'app', ...query }), {
    width: 1280,
    height: 800,
  })
const specsTab = button('Specs', 'tab')

test('Trace with no issue chosen lists the merges with who did them and links', { skip }, async () => {
  await page.open(harness.url({ page: 'trace', done: 'full' }), {
    width: 1280,
    height: 800,
  })
  await page.until(`Boolean(document.querySelector('[data-done-row="S4"]'))`)
  const rows = await page.evaluate(
    `[...document.querySelectorAll('[data-done-row]')].map((r) => [r.dataset.doneRow, r.querySelector('[data-done-who]').textContent, r.querySelector('[data-done-time]').textContent, [...r.querySelectorAll('a')].map((a) => a.getAttribute('href'))])`,
  )
  assert.deepEqual(rows, [
    ['S4', 'Radar crew Draco', 'Merged Mon 11:40 UTC', ['https://github.com/acme/recipe-box/pull/57', 'https://github.com/acme/recipe-box/issues/52']],
    ['S1', 'No crew found on the issue', 'Merged Sun 10:00 UTC', ['https://github.com/acme/recipe-box/pull/41', 'https://github.com/acme/recipe-box/issues/40']],
  ])
  await click(`document.querySelector('[aria-label="Trace of Index builder"]')`)
  await page.until(`document.querySelector('[data-picked]').textContent === 'acme/recipe-box#52'`)
  assert.deepEqual(page.errors, [])
})

test('Trace with nothing merged says what to do, with a button', { skip }, async () => {
  await page.open(harness.url({ page: 'trace', done: 'empty' }), {
    width: 1280,
    height: 800,
  })
  await page.until(`Boolean(document.querySelector('[data-done-empty]'))`)
  assert.match(await page.evaluate(`document.querySelector('[data-done-empty]').textContent`), /Nothing has merged yet/)
  await click(button('Open Specs'))
  await page.until(`document.querySelector('[data-picked]').textContent === 'epics'`)
})

test('the real sample: Specs is one list with a status chip per spec, and a spec opens beside it', { skip }, async () => {
  await page.open(harness.url({ page: 'demo' }), {
    width: 1280,
    height: 800,
  })
  await page.until(`Boolean(${button('Start demo')})`)
  await click(button('Start demo'))
  await page.until(`Boolean(document.querySelector('[data-demo-tour]'))`)
  await click(button('Close the tour'))
  await click(specsTab)
  await page.until(`Boolean(document.querySelector('[data-spec-list] [data-plan-row]'))`)
  const chips = await page.evaluate(`Object.fromEntries([...document.querySelectorAll('[data-spec-list] [data-plan-row]')].map((r) => [r.querySelector('.truncate').textContent, r.dataset.specChip]))`)
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

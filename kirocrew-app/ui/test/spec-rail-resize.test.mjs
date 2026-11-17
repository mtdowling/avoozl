// A spec's right rail has a handle on its left edge, like the nav and list
// columns: drag it or press Left/Right to change the width, double-click to
// reset. The width is kept in this browser and never squeezes the cards
// under SPEC_CARDS_MIN; a rail wider than fits beside the specs list folds
// the list into a thin bar, so at 1280 px it can grow 200+ px. A phone stacks the rail under the cards with no
// handle. Browser parts run in a real Chrome (AVOOZL_CHROME), skipped
// without one.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'

const { LIST, LIST_FOLDED_WIDTH, SPEC_RAIL, SPEC_CARDS_MIN, SPEC_RAIL_GUTTER, railMax, railRoom, stepWidth } = await import('../src/columns.ts')

test('the rail never squeezes the cards, and its keys widen to the left', () => {
  assert.equal(railMax(2000), SPEC_RAIL.max)
  assert.equal(railMax(800), 800 - SPEC_CARDS_MIN - SPEC_RAIL_GUTTER)
  assert.equal(railMax(SPEC_CARDS_MIN + SPEC_RAIL_GUTTER + SPEC_RAIL.min - 1), null, 'too narrow: no handle')
  assert.equal(stepWidth(236, 'ArrowLeft', 'left'), 252)
  assert.equal(stepWidth(236, 'ArrowRight', 'left'), 220)
  assert.equal(stepWidth(236, 'Tab', 'left'), null)
})

test('a wide rail folds the list and gets its room; the fold is the same measured either way', () => {
  const gain = LIST.initial + 8 - LIST_FOLDED_WIDTH
  const open = 552
  const fits = railMax(open)
  const before = railRoom(open, false, gain, SPEC_RAIL.initial)
  assert.equal(before.fold, false)
  assert.ok(before.max > fits, 'folding gives more room than fits beside the list')
  const wide = railRoom(open, false, gain, fits + 1)
  assert.equal(wide.fold, true)
  assert.deepEqual(railRoom(open + gain, true, gain, fits + 1), wide, 'measured folded, the answer holds')
  assert.equal(railRoom(open + gain, true, gain, fits).fold, false, 'narrow again: the list comes back')
  const tight = railRoom(400, false, gain, SPEC_RAIL.initial)
  assert.equal(tight.fold, false, 'the default rail never folds the list')
  assert.equal(tight.fits, SPEC_RAIL.initial)
  assert.equal(railRoom(400, false, gain, SPEC_RAIL.initial + 1).fold, true)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the spec rail tests'
let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({ scripts: { 'demo.js': demoScript(await demoReplies()) } })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const wait = (ms = 200) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
const button = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
const HANDLE = '[data-spec-body] > [data-resize-handle]'
const box = (sel) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height } })()`)

async function openSpec(width, dark, { clear = false } = {}) {
  const url = harness.url({ page: 'demo', theme: dark ? 'dark' : 'light' })
  await page.open(url, { width, height: 900, dark })
  if (clear) {
    await page.evaluate('localStorage.clear()')
    await page.open(url, { width, height: 900, dark })
  }
  await page.until(`Boolean(${button('Start demo')})`)
  await click(button('Start demo'))
  await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
  if (width < 768) {
    await click(`document.querySelector('[data-top-rail-bar]')`)
    await wait(150)
  }
  await click(`document.querySelector('[data-nav-group="plans"]')`)
  if (width < 768) await click(`document.querySelector('[data-top-rail-bar]')`)
  await page.until(`Boolean(document.querySelector('[data-plans-list]'))`)
  await click(button('Meal planner', `document.querySelector('[data-plans-list]')`))
  await page.until(`Boolean(document.querySelector('[data-spec-rail] [data-state-count]'))`)
  await wait(400)
}

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'
  test(`desktop (${theme}): drag, keys and double-click resize the rail, and the width is remembered`, { skip }, async () => {
    await openSpec(1280, dark, { clear: true })
    const aside = '[aria-label="Spec details"]'
    const start = await box(aside)
    assert.equal(Math.round(start.width), SPEC_RAIL.initial)
    const handle = await box(HANDLE)
    assert.ok(handle, 'a handle')
    assert.ok(Math.abs(handle.right + 8 - start.left) <= 1, 'the handle sits on the rail’s left edge')
    const aria = await page.evaluate(`(() => { const h = document.querySelector(${JSON.stringify(HANDLE)}); return { role: h.getAttribute('role'), now: Number(h.getAttribute('aria-valuenow')), max: Number(h.getAttribute('aria-valuemax')), tab: h.tabIndex, cursor: getComputedStyle(h).cursor } })()`)
    assert.deepEqual([aria.role, aria.now, aria.tab, aria.cursor], ['separator', SPEC_RAIL.initial, 0, 'col-resize'])
    // At 1280 with the nav and list at their defaults, the rail can grow 200+.
    assert.ok(aria.max >= SPEC_RAIL.initial + 200, `room to grow at 1280 (${aria.max})`)
    assert.equal(await box('[data-list-folded]'), null, 'the list is open')
    // Drag 240 px left: 240 px wider; the list folds, the cards stay beside it.
    const y = handle.top + 40
    await page.drag(handle.left + 4, y, handle.left + 4 - 240)
    await wait()
    const wider = await box(aside)
    assert.equal(Math.round(wider.width), SPEC_RAIL.initial + 240)
    assert.ok(await box('[data-list-folded]'), 'the list folds into a bar')
    assert.ok(await page.evaluate(`Boolean(document.querySelector('[data-left-nav] input[placeholder="Search specs"]'))`), 'the nav keeps the specs filters')
    const main = await box('#avoozl-plan-main')
    assert.ok(main.right <= wider.left, 'the rail is still right of the cards')
    assert.ok(main.width >= SPEC_CARDS_MIN - 1, `the cards keep their width (${main.width})`)
    // The bar brings the list back, with the widest rail that fits beside it.
    await click(`document.querySelector('[data-list-unfold]')`)
    await wait()
    assert.equal(await box('[data-list-folded]'), null, 'the list is back')
    const fit = await box(aside)
    assert.ok(fit.width >= SPEC_RAIL.initial && fit.width < wider.width, `the rail fits beside it (${fit.width})`)
    assert.ok((await box('#avoozl-plan-main')).width >= SPEC_CARDS_MIN - 1)
    // A drag far past the max stops at the max, with the cards still wide enough.
    const h1 = await box(HANDLE)
    await page.drag(h1.left + 4, y, 0)
    await wait()
    const most = await box(aside)
    assert.ok(Math.round(most.width) <= aria.max, `at most the max (${most.width} vs ${aria.max})`)
    assert.equal(Math.round(most.width), aria.max, 'a long drag stops at the max')
    const squeezed = await box('#avoozl-plan-main')
    assert.ok(squeezed.width >= SPEC_CARDS_MIN - 1 && squeezed.right <= most.left, `the cards never get too narrow or wrap (${squeezed.width})`)
    // Double-click resets; the keys step 16 px.
    const h2 = await box(HANDLE)
    await page.doubleClick(h2.left + 4, y)
    await wait()
    assert.equal(Math.round((await box(aside)).width), SPEC_RAIL.initial)
    assert.equal(await box('[data-list-folded]'), null, 'reset brings the list back')
    await page.evaluate(`document.querySelector(${JSON.stringify(HANDLE)}).focus()`)
    await page.key('ArrowLeft', 'ArrowLeft', 37)
    await page.key('ArrowLeft', 'ArrowLeft', 37)
    await wait()
    assert.equal(Math.round((await box(aside)).width), SPEC_RAIL.initial + 32)
    assert.equal(await page.evaluate(`Number(document.querySelector(${JSON.stringify(HANDLE)}).getAttribute('aria-valuenow'))`), SPEC_RAIL.initial + 32)
    await page.key('ArrowRight', 'ArrowRight', 39)
    await wait()
    assert.equal(Math.round((await box(aside)).width), SPEC_RAIL.initial + 16)
    // Remembered after a reload.
    await openSpec(1280, dark)
    assert.equal(Math.round((await box(aside)).width), SPEC_RAIL.initial + 16, 'the width is remembered')
    assert.deepEqual(page.errors, [])
    await page.evaluate('localStorage.clear()')
  })

  test(`phone (${theme}): the rail stacks under the cards with no handle`, { skip }, async () => {
    await openSpec(390, dark, { clear: true })
    assert.equal(await box(HANDLE), null)
    const rail = await box('[aria-label="Spec details"]')
    const main = await box('#avoozl-plan-main')
    assert.ok(rail.top >= main.top + main.height - 1, 'the rail is under the cards')
  })
}

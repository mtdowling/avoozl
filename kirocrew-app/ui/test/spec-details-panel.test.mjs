// A spec's details sit in a panel at the bottom of the specs list column,
// like an IDE's bottom panel. On a desktop the list above shrinks so both
// fit on screen and the spec keeps the full height of its column; the
// panel's top bar drags, or takes Up and Down, to change the height, and
// double-click resets it. A chevron hides and shows the panel. Height and
// hidden are kept in this browser. A phone shows the list or the spec, so
// it stacks the panel under the spec with the same chevron and no divider. Browser parts run in a real Chrome
// (AVOOZL_CHROME), skipped without one.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'

const { SPEC_PANEL, SPEC_CONTENT_MIN, panelMax, stepHeight } = await import('../src/columns.ts')

test('the panel leaves the spec room, and Up makes it taller', () => {
  assert.equal(panelMax(4000), SPEC_PANEL.max)
  assert.equal(panelMax(600), 600 - SPEC_CONTENT_MIN)
  assert.equal(panelMax(100), SPEC_PANEL.min, 'never under the minimum')
  assert.equal(stepHeight(240, 'ArrowUp'), 256)
  assert.equal(stepHeight(240, 'ArrowDown'), 224)
  assert.equal(stepHeight(240, 'ArrowLeft'), null)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the spec details panel tests'
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
const DIVIDER = '[data-spec-panel-divider]'
const TOGGLE = `document.querySelector('[data-spec-panel-toggle]')`
const box = (sel) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } })()`)

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
  test(`desktop (${theme}): the details sit under the specs list, resize from the top bar, hide, and are remembered`, { skip }, async () => {
    await openSpec(1280, dark, { clear: true })
    const panel = '[aria-label="Spec details"]'
    const scroll = '[data-spec-scroll]'
    const inside = (sel, column) => page.evaluate(`Boolean(document.querySelector(${JSON.stringify(`${column} ${sel}`)}))`)
    assert.equal(await inside(panel, '[data-list-pane="specs"]'), true, 'the panel is in the specs list column')
    assert.equal(await inside(panel, '[data-detail-column="specs"]'), false, 'not in the spec column')
    assert.equal(await inside('[data-plans-list]', scroll), true, 'the list is above it')
    const start = await box(panel)
    const above = await box(scroll)
    const list = await box('[data-list-pane="specs"]')
    const column = await box('[data-detail-column="specs"]')
    assert.ok(start && above, 'the panel and the list')
    assert.ok(start.top >= above.bottom - 1, 'the panel is under the list')
    assert.ok(Math.abs(start.left - list.left) <= 1 && start.right <= list.right + 1 && start.right >= list.right - 8, 'as wide as the list column')
    assert.ok(Math.abs(start.bottom - list.bottom) <= 1, 'at the bottom of the list column')
    assert.ok(Math.abs(column.bottom - list.bottom) <= 1 && Math.abs(column.top - list.top) <= 1, 'the spec column keeps its full height')
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-detail-column="specs"] [data-spec-scroll]'))`), false, 'the spec is not split')
    assert.equal(Math.round(start.height), SPEC_PANEL.initial)
    // Both fit in the page's pane: nothing outside it scrolls.
    const fits = await page.evaluate(`(() => { const p = document.querySelector('[data-avoozl-pane]'); return p.scrollHeight <= p.clientHeight + 1 && document.querySelector(${JSON.stringify(panel)}).getBoundingClientRect().bottom <= p.getBoundingClientRect().bottom + 1 })()`)
    assert.ok(fits, 'the list and its panel fit on screen')
    // The sections sit side by side, in more than one column.
    const lefts = await page.evaluate(`new Set([...document.querySelectorAll('[data-spec-panel-body] [data-rail-section]')].map((s) => Math.round(s.getBoundingClientRect().left))).size`)
    assert.ok(lefts >= 2, `sections in a grid (${lefts} columns)`)
    const aria = await page.evaluate(`(() => { const h = document.querySelector(${JSON.stringify(DIVIDER)}); return { role: h.getAttribute('role'), orientation: h.getAttribute('aria-orientation'), now: Number(h.getAttribute('aria-valuenow')), tab: h.tabIndex, cursor: getComputedStyle(h).cursor } })()`)
    assert.deepEqual(aria, { role: 'separator', orientation: 'horizontal', now: SPEC_PANEL.initial, tab: 0, cursor: 'row-resize' })
    // Drag the bar 150 px up: the panel grows 150, the list shrinks 150.
    const bar = await box(DIVIDER)
    await page.drag(bar.left + 100, bar.top + 6, bar.left + 100, 8, bar.top + 6 - 150)
    await wait()
    const taller = await box(panel)
    assert.equal(Math.round(taller.height), SPEC_PANEL.initial + 150)
    assert.equal(Math.round((await box(scroll)).height), Math.round(above.height - 150), 'the list above shrinks')
    // A drag far up stops with the list still SPEC_CONTENT_MIN tall.
    const bar2 = await box(DIVIDER)
    await page.drag(bar2.left + 100, bar2.top + 6, bar2.left + 100, 8, 0)
    await wait()
    assert.ok(Math.round((await box(scroll)).height) >= SPEC_CONTENT_MIN - 1, 'the list keeps its minimum')
    // Double-click resets; the keys step 16 px.
    const bar3 = await box(DIVIDER)
    await page.doubleClick(bar3.left + 100, bar3.top + 6)
    await wait()
    assert.equal(Math.round((await box(panel)).height), SPEC_PANEL.initial)
    await page.evaluate(`document.querySelector(${JSON.stringify(DIVIDER)}).focus()`)
    await page.key('ArrowUp', 'ArrowUp', 38)
    await page.key('ArrowUp', 'ArrowUp', 38)
    await page.key('ArrowDown', 'ArrowDown', 40)
    await wait()
    assert.equal(Math.round((await box(panel)).height), SPEC_PANEL.initial + 16)
    // The chevron hides it; the list takes the full height of its column.
    await click(TOGGLE)
    await wait()
    assert.equal(await box(panel), null, 'hidden')
    assert.equal(await page.evaluate(`${TOGGLE}.getAttribute('aria-expanded')`), 'false')
    const full = await box(scroll)
    assert.ok(full.height > above.height + SPEC_PANEL.initial - 1, 'the list takes the room')
    const shut = await box(DIVIDER)
    assert.ok(Math.abs(full.bottom - shut.top) <= 1 && Math.abs(shut.bottom - list.bottom) <= 1, 'down to the bar at the bottom of the column')
    // Hidden is remembered after a reload, then shown again with its height.
    await openSpec(1280, dark)
    assert.equal(await box(panel), null, 'still hidden after a reload')
    await click(TOGGLE)
    await wait()
    assert.equal(Math.round((await box(panel)).height), SPEC_PANEL.initial + 16, 'the height is remembered')
    await openSpec(1280, dark)
    assert.equal(Math.round((await box(panel)).height), SPEC_PANEL.initial + 16, 'shown is remembered')
    assert.deepEqual(page.errors, [])
    await page.evaluate('localStorage.clear()')
  })

  test(`phone (${theme}): the details stack under the spec with the chevron and no divider`, { skip }, async () => {
    await openSpec(390, dark, { clear: true })
    assert.equal(await box(DIVIDER), null, 'no divider')
    const rail = await box('[aria-label="Spec details"]')
    const main = await box('#avoozl-plan-main')
    assert.ok(rail.top >= main.bottom - 1, 'under the spec')
    await click(TOGGLE)
    await wait()
    assert.equal(await box('[aria-label="Spec details"]'), null, 'hidden')
    assert.ok(await box('[data-spec-panel-bar]'), 'the bar stays to show it again')
    await click(TOGGLE)
    await wait()
    assert.ok(await box('[aria-label="Spec details"]'), 'shown again')
    assert.deepEqual(page.errors, [])
    await page.evaluate('localStorage.clear()')
  })
}

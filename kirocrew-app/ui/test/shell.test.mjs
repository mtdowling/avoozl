// The three-column shell (follows Kiro Crew's list-detail pattern). Column
// widths clamp and are remembered; the left nav collapses to a thin bar with
// vertical text and comes back; a desktop has the nav, a phone the hamburger.
// Browser parts run in a real Chrome (AVOOZL_CHROME), skipped without one.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const { NAV, LIST, clampWidth, listSpec, readFlag, readWidth, stepWidth, writeFlag, writeWidth } = await import('../src/columns.ts')

test('widths clamp, step by 16 px and are kept per column, the default unstored', () => {
  assert.equal(clampWidth(NAV, 10), NAV.min)
  assert.equal(clampWidth(NAV, 9999), NAV.max)
  assert.equal(clampWidth(NAV, Number.NaN), NAV.initial)
  assert.equal(stepWidth(200, 'ArrowRight'), 216)
  assert.equal(stepWidth(200, 'ArrowLeft'), 184)
  assert.equal(stepWidth(200, 'Tab'), null)
  const saved = new Map()
  const storage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) }
  const specs = listSpec('specs')
  assert.equal(readWidth(storage, specs), LIST.initial)
  writeWidth(storage, specs, 420)
  assert.equal(readWidth(storage, specs), 420)
  assert.equal(readWidth(storage, listSpec('needs')), LIST.initial, 'each list keeps its own')
  writeWidth(storage, specs, LIST.initial)
  assert.equal(saved.size, 0)
  writeFlag(storage, 'k', true)
  assert.equal(readFlag(storage, 'k'), true)
  writeFlag(storage, 'k', false)
  assert.equal(readFlag(storage, 'k'), false)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the shell tests'
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
const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 120))')
const box = (sel) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })()`)

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'
  test(`desktop (${theme}): the nav is a left column; it collapses to a thin bar with vertical text, and both are remembered`, { skip }, async () => {
    await page.open(harness.url({ page: 'app', theme }), { width: 1280, height: 800, dark })
    await page.evaluate('localStorage.clear()')
    await page.open(harness.url({ page: 'app', theme }), { width: 1280, height: 800, dark })
    await page.until(`Boolean(document.querySelector('[data-left-nav="open"]'))`)
    const nav = await box('[data-left-nav]')
    const pane = await box('[data-avoozl-pane]')
    assert.ok(pane.left >= nav.left + nav.width, 'the page sits right of the nav')
    assert.ok(nav.height > 300, 'the nav runs down the page')
    // Keyboard resize, then remembered after a reload.
    await page.evaluate(`document.querySelector('[data-resize-handle]').focus()`)
    await page.key('ArrowRight', 'ArrowRight', 39)
    await settle()
    const wider = (await box('[data-left-nav]')).width
    assert.equal(wider, nav.width + 16)
    await page.open(harness.url({ page: 'app', theme }), { width: 1280, height: 800, dark })
    await page.until(`Boolean(document.querySelector('[data-left-nav="open"]'))`)
    assert.equal((await box('[data-left-nav]')).width, wider, 'the width is remembered')
    // Collapse.
    await page.evaluate(`document.querySelector('[data-nav-collapse]').click()`)
    await settle()
    const bar = await box('[data-left-nav="collapsed"]')
    assert.ok(bar.width <= 40, `a thin bar (${bar.width})`)
    assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('[data-left-nav="collapsed"] [data-nav-collapsed-item]')).writingMode`), 'vertical-rl')
    await page.open(harness.url({ page: 'app', theme }), { width: 1280, height: 800, dark })
    await page.until(`Boolean(document.querySelector('[data-left-nav]'))`)
    assert.ok(await page.evaluate(`Boolean(document.querySelector('[data-left-nav="collapsed"]'))`), 'collapse is remembered')
    await page.evaluate(`document.querySelector('[data-nav-expand]').click()`)
    await settle()
    assert.ok(await page.evaluate(`Boolean(document.querySelector('[data-left-nav="open"]'))`))
    await page.evaluate('localStorage.clear()')
  })

  test(`phone (${theme}): no left nav; the hamburger sits in the one header row`, { skip }, async () => {
    await page.open(harness.url({ page: 'app', theme }), { width: 390, height: 800, dark })
    await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-left-nav]'))`), false)
    const header = await box('[data-phone-header]')
    const bar = await box('[data-top-rail-bar]')
    assert.ok(bar.top >= header.top && bar.top + bar.height <= header.top + header.height + 1, 'the hamburger is in the header row')
    assert.ok(header.height <= 48, `one thin row (${header.height})`)
  })
}

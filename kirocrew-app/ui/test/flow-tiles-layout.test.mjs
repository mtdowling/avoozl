// Flow metric tiles in the app shell (harness ?page=app&flow=1): all six sit
// on one row that spans the content width at 1280 px, wrap two per row with no
// overflow at 375 px, and share one title size and one value size.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Flow tile layout tests'

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

const wait = (ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)

export async function openFlow(width) {
  await page.open(harness.url({ page: 'app', radar: '1', flow: '1' }), { width, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(200)
  await page.evaluate(`document.querySelector('[data-nav-group="flow"], [data-nav-item="flow"]').click()`)
  if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await page.until(`Boolean(document.querySelector('[data-flow-cards]'))`)
  await wait(200)
}

const READ = `(() => {
  const box = document.querySelector('[data-flow-cards]')
  const r = (el) => el.getBoundingClientRect()
  const tiles = [...box.children]
  const titles = tiles.map((t) => getComputedStyle(t.querySelector('[tabindex]')))
  const values = tiles.map((t) => t.querySelector('span.tabular-nums')).filter(Boolean).map((v) => getComputedStyle(v).fontSize)
  return {
    count: tiles.length,
    tops: [...new Set(tiles.map((t) => Math.round(r(t).top)))].length,
    first: r(tiles[0]).left, last: r(tiles.at(-1)).right,
    box: { left: r(box).left, right: r(box).right },
    widths: tiles.map((t) => Math.round(r(t).width)),
    titleSizes: [...new Set(titles.map((s) => s.fontSize))],
    titleBold: titles.every((s) => Number(s.fontWeight) >= 600),
    titleUpper: titles.every((s) => s.textTransform === 'uppercase'),
    valueSizes: [...new Set(values)],
    overflow: document.documentElement.scrollWidth > innerWidth || tiles.some((t) => t.scrollWidth > t.clientWidth + 1),
  }
})()`

test('six tiles share one full-width row at 1280 px, with one title and one value size', { skip }, async () => {
  await openFlow(1280)
  const m = await page.evaluate(READ)
  assert.equal(m.count, 6)
  assert.equal(m.tops, 1, 'one row')
  assert.ok(Math.abs(m.first - m.box.left) <= 1 && Math.abs(m.last - m.box.right) <= 1, 'spans the content width')
  assert.ok(Math.max(...m.widths) - Math.min(...m.widths) <= 1, `equal widths ${m.widths}`)
  assert.equal(m.titleSizes.length, 1)
  assert.ok(m.titleBold && m.titleUpper)
  assert.equal(m.valueSizes.length, 1)
  assert.equal(m.overflow, false)
})

test('tiles wrap two per row with no overflow at 375 px', { skip }, async () => {
  await openFlow(375)
  const m = await page.evaluate(READ)
  assert.equal(m.tops, 3, 'three rows of two')
  assert.ok(Math.min(...m.widths) >= 100, `min width ${m.widths}`)
  assert.equal(m.overflow, false)
})

// The page's navigation on a phone follows Kiro Crew's list-detail pattern.
// In a real Chrome (AVOOZL_CHROME, or an installed Chrome or Chromium) on the
// harness page, at 390 and 1280 px, light and dark: a phone has a thin top bar
// that opens a full-page list and closes when a section is picked; a desktop
// keeps its left nav. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the phone rail tests'
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

const settle = () => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
const box = (selector) =>
  page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height, hidden: el.hidden } })()`)
const sideways = () => page.evaluate(`Math.max(document.scrollingElement.scrollWidth, document.querySelector('[data-avoozl-pane]').scrollWidth) > innerWidth`)

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'
  test(`a phone at 390 px has a top bar; opening it takes the page and picking a section closes it (${theme})`, { skip }, async () => {
    await page.open(harness.url({ page: 'app', theme }), { width: 390, height: 800, dark })
    await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
    await settle()
    const bar = await box('[data-top-rail-bar]')
    assert.ok(bar.height <= 28, `the bar is a compact button (${bar.height})`)
    // The hamburger shares the one header row with Stop the line and More.
    assert.ok((await box('[data-phone-header]')).width >= 340, 'the header row spans the screen')
    assert.ok(bar.top < 250, 'the bar is near the top')
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-top-row] [data-nav-head]').length`), 0, 'no tab row')
    assert.match(await page.evaluate(`document.querySelector('[data-top-rail-bar]').textContent`), /Home/)
    assert.equal(await sideways(), false)

    await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    await settle()
    const list = await box('[data-top-rail-list]')
    const pane = await box('[data-avoozl-pane]')
    assert.ok(list.height > 300, `the list takes the page (${list.height})`)
    assert.ok(pane.hidden || pane.height === 0, 'the page content is out of the way')
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-top-rail-list] [data-nav-head]').length`), 8, 'eight sections')

    // A section opens in the menu; picking one of its pages closes the menu.
    await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Needs you')).click()`)
    await settle()
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-top-rail-list] [data-nav-section][data-open]').length`), 1, 'only Needs you is open')
    await page.evaluate(`document.querySelector('[data-top-rail-list] [data-nav-item="waiting/intake"]').click()`)
    await settle()
    assert.equal(await box('[data-top-rail-list]'), null, 'picking collapses the rail')
    assert.match(await page.evaluate(`document.querySelector('[data-top-rail-bar]').textContent`), /Needs you · Planning and intake/)
    assert.ok((await box('[data-avoozl-pane]')).height > 100, 'the page shows again')
  })

  test(`a desktop at 1280 px keeps its tab row (${theme})`, { skip }, async () => {
    await page.open(harness.url({ page: 'app', theme }), { width: 1280, height: 800, dark })
    await page.until(`Boolean(document.querySelector('[data-top-row] [data-nav-head]'))`)
    await settle()
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-top-row] [data-nav-head]').length`), 8)
    assert.equal(await box('[data-top-rail-bar]'), null, 'no top bar')
    assert.equal(await sideways(), false)
  })
}

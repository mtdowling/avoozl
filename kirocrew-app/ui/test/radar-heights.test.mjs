// The left nav and the top card follow Issue Radar's sidebar, measured on a
// Kiro Crew host (2026-11-15): a 42 px top card (its repository) on a desktop,
// cards with 12 px corners, rows with 8 px corners and 13 px text. Every
// button keeps Kiro Crew's compact size, 28 px at most, on every screen (the
// owner's rule, button-size.test.mjs): so a nav row and the phone's top card
// are 28 px, not Radar's taller ones. Checked at 390 and 1280 px, light and
// dark, on the harness page.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Radar heights test'

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

const RADAR = { top: 42, phoneTop: 28, row: 28, cardRadius: 12, rowRadius: 8, rowFont: 13 }

for (const theme of ['light', 'dark']) {
  test(`at 1280 px ${theme} the nav is Radar's: a 42 px top card, then a card of 28 px rows`, { skip }, async () => {
    await page.open(harness.url({ app: '1', theme }), { width: 1280, height: 800, dark: theme === 'dark' })
    await page.until(`Boolean(document.querySelector('[data-nav-top]') && document.querySelector('[data-nav-card] [data-nav-item]'))`)
    const got = await page.evaluate(`(() => {
      const top = document.querySelector('[data-nav-top]'), card = document.querySelector('[data-nav-card]')
      const rows = [...card.querySelectorAll('[data-nav-item]')]
      return {
        top: Math.round(top.getBoundingClientRect().height),
        topRadius: parseFloat(getComputedStyle(top).borderTopLeftRadius),
        cardRadius: parseFloat(getComputedStyle(card).borderTopLeftRadius),
        cardBorder: parseFloat(getComputedStyle(card).borderTopWidth),
        rows: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
        rowRadius: [...new Set(rows.map((r) => parseFloat(getComputedStyle(r).borderTopLeftRadius)))],
        rowFont: [...new Set(rows.map((r) => parseFloat(getComputedStyle(r).fontSize)))],
        picker: Boolean(top.querySelector('select[aria-label="Workspace"]')),
      }
    })()`)
    assert.equal(got.top, RADAR.top)
    assert.equal(got.topRadius, RADAR.cardRadius)
    assert.equal(got.cardRadius, RADAR.cardRadius)
    assert.equal(got.cardBorder, 1)
    assert.deepEqual(got.rows, [RADAR.row])
    assert.deepEqual(got.rowRadius, [RADAR.rowRadius])
    assert.deepEqual(got.rowFont, [RADAR.rowFont])
    assert.equal(got.picker, true, 'the top card holds the workspace')
  })

  test(`at 390 px ${theme} the phone's top card: a 28 px button with the page name and the open-the-list icon`, { skip }, async () => {
    await page.open(harness.url({ app: '1', theme }), { width: 390, height: 844, dark: theme === 'dark' })
    await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
    const got = await page.evaluate(`(() => {
      const bar = document.querySelector('[data-top-rail-bar]')
      const icon = bar.lastElementChild.getBoundingClientRect(), r = bar.getBoundingClientRect()
      return { height: Math.round(r.height), radius: parseFloat(getComputedStyle(bar).borderTopLeftRadius), iconAtRight: r.right - icon.right < 16 }
    })()`)
    assert.equal(got.height, RADAR.phoneTop)
    assert.equal(got.radius, RADAR.cardRadius)
    assert.equal(got.iconAtRight, true)
  })
}

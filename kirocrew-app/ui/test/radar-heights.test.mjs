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

// Radar's own headers are 38 px and its items 32 px; ours keep the compact 28 px.
const RADAR = { top: 42, phoneTop: 28, row: 28, cardRadius: 12, sectionRadius: 16, rowRadius: 8, rowFont: 13, headFont: 12 }

for (const theme of ['light', 'dark']) {
  test(`at 1280 px ${theme} the nav is Radar's: a card per section with 28 px headers, one open at a time, a line section, then the brand card`, { skip }, async () => {
    await page.open(harness.url({ app: '1', theme }), { width: 1280, height: 800, dark: theme === 'dark' })
    await page.until(`Boolean(document.querySelector('[data-brand-card]') && document.querySelector('[data-nav-section]'))`)
    const read = () => page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('[data-nav-section]')]
      const heads = cards.map((c) => c.querySelector('[data-nav-head]'))
      const cs = (el) => getComputedStyle(el)
      const items = [...document.querySelectorAll('[data-nav-children] [data-nav-item]')]
      return {
        cards: cards.length,
        cardRadius: [...new Set(cards.map((c) => parseFloat(cs(c).borderTopLeftRadius)))],
        cardBorder: [...new Set(cards.map((c) => parseFloat(cs(c).borderTopWidth)))],
        heads: [...new Set(heads.map((h) => Math.round(h.getBoundingClientRect().height)))],
        headFont: [...new Set(heads.map((h) => parseFloat(cs(h).fontSize)))],
        headCase: [...new Set(heads.map((h) => cs(h).textTransform))],
        items: [...new Set(items.map((r) => Math.round(r.getBoundingClientRect().height)))],
        itemRadius: [...new Set(items.map((r) => parseFloat(cs(r).borderTopLeftRadius)))],
        itemFont: [...new Set(items.map((r) => parseFloat(cs(r).fontSize)))],
        open: cards.filter((c) => c.hasAttribute('data-open')).map((c) => c.dataset.navSection),
        chevrons: document.querySelectorAll('[data-nav-chevron]').length,
        order: [...document.querySelectorAll('[data-nav-accordion], [data-nav-line], [data-brand-card]')].map((el) => el.hasAttribute('data-nav-accordion') ? 'nav' : el.hasAttribute('data-nav-line') ? 'line' : 'brand'),
      }
    })()`)
    const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    // Settings opens in the nav, with its sections as items.
    await click('[data-nav-group="settings"]')
    await page.until(`Boolean(document.querySelector('[data-nav-children="settings"]'))`)
    let got = await read()
    assert.equal(got.cards, 7)
    assert.deepEqual(got.cardRadius, [RADAR.sectionRadius])
    assert.deepEqual(got.cardBorder, [1])
    assert.deepEqual(got.heads, [RADAR.row])
    assert.deepEqual(got.headFont, [RADAR.headFont])
    assert.deepEqual(got.headCase, ['uppercase'])
    assert.deepEqual(got.items, [RADAR.row])
    assert.deepEqual(got.itemRadius, [RADAR.rowRadius])
    assert.deepEqual(got.itemFont, [RADAR.rowFont])
    assert.deepEqual(got.open, ['settings'])
    assert.equal(got.chevrons, 3, 'a chevron on each section that has pages')
    assert.deepEqual(got.order, ['nav', 'line', 'brand'])
    // Opening Needs you closes Settings: one section is open at a time.
    await click('[data-nav-group="waiting"]')
    await page.until(`Boolean(document.querySelector('[data-nav-children="waiting"]'))`)
    got = await read()
    assert.deepEqual(got.open, ['waiting'])
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-nav-children="settings"]'))`), false)
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

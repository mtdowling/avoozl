// Every tab in every tab bar shows its label while inactive, with readable
// contrast, light and dark, narrow and wide. The host's SegmentedControl hides
// every unselected label (and below 44 px a segment turns the bar into one
// dropdown) unless collapse={false}; the harness stub models that. Skipped
// when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the tab label tests'
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

// Every tab bar now showing: each tab's text, its size and its text contrast
// against the first opaque background behind it.
const READ = `(() => {
  const rgb = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 } }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const back = (el) => { for (; el; el = el.parentElement) { const c = rgb(getComputedStyle(el).backgroundColor); if (c.a > 0.99) return c } return { r: 255, g: 255, b: 255 } }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  return [...document.querySelectorAll('[role="tablist"], [role="radiogroup"]')].map((bar) => ({
    bar: bar.getAttribute('aria-label'),
    collapsed: Boolean(document.querySelector('[data-collapsed]')),
    tabs: [...bar.querySelectorAll('[role="tab"], [role="radio"]')].map((tab) => {
      const box = tab.getBoundingClientRect()
      const text = tab.textContent.trim()
      return { text, visible: box.width > 0 && box.height > 0 && getComputedStyle(tab).visibility === 'visible', contrast: ratio(rgb(getComputedStyle(tab).color), back(tab)) }
    }),
  }))
})()`

for (const [width, height] of [[390, 800], [1280, 800]])
  for (const dark of [false, true])
    test(`every tab shows a readable label when inactive at ${width} px ${dark ? 'dark' : 'light'}`, { skip }, async () => {
      await page.open(harness.url({ page: 'app', theme: dark ? 'dark' : 'light' }), { width, height, dark })
      await page.until(`Boolean(document.querySelector('[data-top-row] [role="tab"]'))`)
      const seen = new Set()
      const names = await page.evaluate(`[...document.querySelectorAll('[data-top-row] [role="tab"]')].map((t, i) => i)`)
      for (const index of names) {
        await page.evaluate(`document.querySelectorAll('[data-top-row] [role="tab"]')[${index}].click()`)
        await settle()
        const bars = await page.evaluate(READ)
        assert.ok(bars.length >= 1, 'the tab row is showing')
        assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-collapsed]'))`), false, 'no tab bar collapses into a dropdown')
        for (const bar of bars) {
          seen.add(bar.bar)
          for (const tab of bar.tabs) {
            assert.ok(tab.text.length > 0, `${bar.bar}: a tab has no label`)
            assert.ok(tab.visible, `${bar.bar}: "${tab.text}" is not visible`)
            assert.ok(tab.contrast >= 4.5, `${bar.bar}: "${tab.text}" contrast ${tab.contrast.toFixed(2)} is under 4.5`)
          }
        }
      }
      assert.ok(seen.has('Avoozl views'), 'the main tab bar was checked')
    })

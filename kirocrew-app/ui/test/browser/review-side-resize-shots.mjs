#!/usr/bin/env node
// Full-app screenshots of a spec's Review tab (&review=1): the side column at
// its default width and dragged 200 px wider at 1280x800, and a phone at
// 390 px (no handle; the column sits under the text). Light and dark.
//   node test/browser/review-side-resize-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: review-side-resize-shots.mjs <out dir>')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS })
const browser = await launch(chrome)
const click = (selector) => `document.querySelector(${JSON.stringify(selector)}).click()`
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark'])
      for (const name of width > 400 ? ['default', 'wider'] : ['phone']) {
        await page.open(harness.url({ page: 'app', radar: '1', specs: '1', review: '1', theme }), { width, height: width > 400 ? 800 : 1700, dark: theme === 'dark' })
        await page.evaluate('localStorage.removeItem("avoozl:review-side-width")')
        await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
        if (width < 768) {
          await page.evaluate(click('[data-top-rail-bar]'))
          await settle()
          await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
          await settle()
          if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)) await page.evaluate(click('[data-top-rail-bar]'))
        } else await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
        await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
        await page.evaluate(click('[data-plan-row="spec:byte-types"]'))
        await page.until(`Boolean(document.querySelector('[data-spec-tab="review"]'))`, 30000)
        await page.evaluate(click('[data-spec-tab="review"]'))
        await page.until(`Boolean(document.querySelector('[data-finding-card]'))`, 30000)
        await settle()
        if (name === 'wider') {
          const h = await page.evaluate(`(() => { const r = document.querySelector('[data-review-side-handle]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 80 } })()`)
          await page.drag(h.x, h.y, h.x - 200)
          await settle()
        }
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
} finally {
  await browser.close()
  harness.remove()
}

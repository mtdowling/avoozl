#!/usr/bin/env node
// Full-app screenshots of Dashboards › Delivery on fake data (harness
// ?page=app&delivery=1): 1280 and 1024 (a 1280 window at 125% zoom) and 853
// (at 150%) show all four lanes in one row; 390 (a phone) stacks them,
// folded. Light and dark: <out>/delivery-<width>-<theme>.png.
//
//   node test/browser/delivery-lanes-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: delivery-lanes-shots.mjs <out dir>')
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
try {
  const page = await browser.page()
  for (const width of [1280, 1024, 853, 768, 390])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', delivery: '1', theme }), { width, height: width > 400 ? 800 : 844, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
      if (width < 768) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
      }
      await page.evaluate(
        `(() => { const h = document.querySelector('${scope} [data-nav-head][data-nav-group="dashboard"]'); if (h && !h.hasAttribute('data-open')) h.click(); return true })()`,
      )
      await page.until(`Boolean(document.querySelector('${scope} [data-nav-item="dashboard/delivery"]'))`)
      await page.evaluate(`document.querySelector('${scope} [data-nav-item="dashboard/delivery"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-lane-columns]'))`, 30000)
      await page.evaluate('new Promise((r) => setTimeout(r, 600))')
      const file = path.join(out, `delivery-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file, await page.evaluate(`document.querySelector('[data-lane-columns]').dataset.laneColumns`))
    }
} finally {
  await browser.close()
  harness.remove()
}

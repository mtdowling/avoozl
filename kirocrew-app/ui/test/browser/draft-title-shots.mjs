#!/usr/bin/env node
// Full-app screenshots of the Specs list: draft rows show a grey title with
// no Draft badge and the legend line sits on top; 1280 and 390 px, light and
// dark.
//   node test/browser/draft-title-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: draft-title-shots.mjs <out dir>')
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
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', radar: '1', specs: '1', theme }), { width, height: width > 400 ? 800 : 844, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
      if (width < 768) {
        await page.evaluate(click('[data-top-rail-bar]'))
        await settle()
        await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
        await settle()
        if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)) await page.evaluate(click('[data-top-rail-bar]'))
      } else await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
      await page.until(`Boolean(document.querySelector('[data-spec-list] [data-plan-row]'))`, 30000)
      await settle()
      const file = path.join(out, `list-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Full-app screenshots at 1280x800 of the Specs page that does not scroll:
// the list alone, a spec's Overview scrolled down (tab bar fixed), and the
// Review tab with its text and side column scrolled; light and dark.
//   node test/browser/specs-scroll-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: specs-scroll-shots.mjs <out dir>')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: await shotCss() })
const browser = await launch(chrome)
const click = (selector) => `document.querySelector(${JSON.stringify(selector)}).click()`
const scroll = (selector, to) => `document.querySelector(${JSON.stringify(selector)}).scrollTop = ${to}`
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  for (const theme of ['light', 'dark'])
    for (const name of ['list', 'overview', 'review']) {
      await page.open(harness.url({ page: 'app', radar: '1', specs: '1', review: '1', theme }), { width: 1280, height: 800, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-top-row] [data-nav-head]'))`, 30000)
      await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
      await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
      if (name !== 'list') {
        await page.evaluate(click('[data-plan-row="spec:byte-types"]'))
        await page.until(`Boolean(document.querySelector('[data-spec-tab]'))`, 30000)
        await settle()
      }
      if (name === 'overview') await page.evaluate(scroll('[data-spec-body]', 380))
      if (name === 'review') {
        await page.evaluate(click('[data-spec-tab="review"]'))
        await page.until(`Boolean(document.querySelector('[data-finding-card]'))`, 30000)
        await settle()
        await page.evaluate(scroll('[data-review-doc]', 160))
        await page.evaluate(scroll('[data-review-rail]', 120))
      }
      await settle()
      const file = path.join(out, `${name}-1280x800-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Full-app screenshots of the Review tab's side column at its default width,
// dragged 200 px wider, and on a phone (no handle); 1400 and 390 px, light
// and dark.
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
const HANDLE = `document.querySelector('[role="separator"][aria-label="Resize the side column"]')`
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  for (const width of [1400, 390])
    for (const theme of ['light', 'dark'])
      for (const name of width > 400 ? ['default', 'wider'] : ['phone']) {
        const url = harness.url({ page: 'app', radar: '1', specs: '1', review: '1', theme })
        await page.open(url, { width, height: width > 400 ? 800 : 844, dark: theme === 'dark' })
        await page.evaluate(`localStorage.removeItem('avoozl:review-side-width')`)
        await page.open(url, { width, height: width > 400 ? 800 : 844, dark: theme === 'dark' })
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
          const at = await page.evaluate(`(() => { const r = ${HANDLE}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 120) } })()`)
          await page.drag(at.x, at.y, at.x - 200)
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

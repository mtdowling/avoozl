#!/usr/bin/env node
// Full-app screenshots of a spec's page and its Review view (tasks 57.4, 57.5) on
// fake findings, desktop (1280) and phone (390), light and dark:
// <out>/<before|after|selected|moved>-<width>-<theme>.png. "before" is the spec page with
// Open review; "after" is the Review view; "selected" has one card picked;
// "moved" is the Design tab with its Moved or removed group.
//
//   node test/browser/review-view-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: review-view-shots.mjs <out dir>')
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
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 300))')
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      const size = { width, height: width > 400 ? 800 : 844, dark: theme === 'dark' }
      for (const [name, steps] of [
        ['before', []],
        ['after', [click('[data-open-review]')]],
        // One card selected: its lines highlighted.
        ['selected', [click('[data-open-review]'), 'wait', click('[data-finding-card="f-later"]')]],
        // Design: a moved finding lists first under Moved or removed.
        ['moved', [click('[data-open-review]'), 'wait', click('[data-review-tab="design.md"]')]],
      ]) {
        const url = harness.url({ page: 'app', radar: '1', specs: '1', review: '1', theme })
        const run = async (height) => {
          await page.open(url, { ...size, ...(height ? { height } : {}) })
          await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
          if (width < 768) {
            // A phone picks Specs in the top rail's menu, then closes it.
            await page.evaluate(click('[data-top-rail-bar]'))
            await settle()
            await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
            await settle()
            if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)) await page.evaluate(click('[data-top-rail-bar]'))
          } else await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
          await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
          await page.evaluate(click('[data-plan-row="spec:byte-types"]'))
          await page.until(`Boolean(document.querySelector('[data-open-review]'))`, 30000)
          for (const step of steps)
            if (step === 'wait') await page.until(`Boolean(document.querySelector('[data-finding-card]'))`, 30000)
            else await page.evaluate(step)
          if (name !== 'before') await page.until(`Boolean(document.querySelector('[data-finding-card]'))`, 30000)
          await settle()
        }
        // Tall enough for the whole view: the app scrolls inside its own pane.
        await run(width > 400 ? 1700 : 3000)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
    }
} finally {
  await browser.close()
  harness.remove()
}

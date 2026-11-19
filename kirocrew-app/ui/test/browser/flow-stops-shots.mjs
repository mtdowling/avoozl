#!/usr/bin/env node
// Full-app shots of Flow's Line stops list (R64.11) at 1280 and 375 px,
// light and dark: <out>/stops-<width>-<theme>.png. Before the list existed
// the shot shows where it goes, under the charts.
//
//   node test/browser/flow-stops-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) process.exit(2)
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness()
const browser = await launch(findChrome())
const wait = (page, ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
try {
  const page = await browser.page()
  for (const [width, height] of [
    [1280, 800],
    [375, 800],
  ])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', radar: '1', flow: '1', stops: '1', theme }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await wait(page, 200)
      await page.evaluate(`document.querySelector('[data-nav-group="flow"], [data-nav-item="flow"]').click()`)
      if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)))
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await page.until(`Boolean(document.querySelector('[data-flow-cards]'))`)
      await wait(page, 500)
      await page.evaluate(
        `(document.querySelector('[data-line-stops]') || [...document.querySelectorAll('h2,h3')].find((h) => /Time to fix/.test(h.innerText)) || document.querySelector('[data-flow-cards]')).scrollIntoView({ block: 'center' })`,
      )
      await wait(page, 300)
      await page.screenshot(path.join(out, `stops-${width}-${theme}.png`))
      if (await page.evaluate(`Boolean(document.querySelector('[data-line-stops]'))`))
        await page.screenshot(path.join(out, `stops-${width}-${theme}-list.png`), { selector: '[data-line-stops]' })
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

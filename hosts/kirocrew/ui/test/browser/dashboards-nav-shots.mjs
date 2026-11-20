#!/usr/bin/env node
// Screenshots of the open Dashboards nav group (harness ?page=app), at 390 px
// (the phone's menu open) and 1280 px, light and dark:
// <out>/dashboards-<width>-<theme>.png.
//
//   node test/browser/dashboards-nav-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: dashboards-nav-shots.mjs <out dir>')
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
const wait = (page, ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
try {
  const page = await browser.page()
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', theme }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      await wait(page, 1200)
      if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await wait(page, 200)
      await page.evaluate(
        `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes('Dashboards')); if (b && !b.hasAttribute('data-open')) b.click() })()`,
      )
      await wait(page)
      const file = path.join(out, `dashboards-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

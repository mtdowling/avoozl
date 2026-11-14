#!/usr/bin/env node
// Screenshots of Trace on fake data (harness ?page=app&radar=1), at 320, 768
// and 1280 px wide, light and dark: <out>/trace-drawer-<width>-<theme>.png
// and trace-page-<width>-<theme>.png.
//
//   node test/browser/trace-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const SIZES = [
  [320, 700],
  [768, 1024],
  [1280, 800],
]
const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: trace-shots.mjs <out dir>')
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
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 200))')
  const button = (text) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`
  for (const [width, height] of SIZES)
    for (const theme of ['light', 'dark']) {
      const size = { width, height, dark: theme === 'dark' }
      await page.open(harness.url({ page: 'app', radar: '1', theme }), size)
      await page.until(`Boolean(${button('Trace')})`)
      await page.evaluate(`${button('Trace')}.click()`)
      await page.until(`Boolean(document.querySelector('[data-trace-drawer] [data-trace-step]'))`)
      await settle()
      const drawer = path.join(out, `trace-drawer-${width}-${theme}.png`)
      await page.screenshot(drawer)
      console.log(drawer)
      await page.open(harness.url({ page: 'app', radar: '1', theme, trace: 'acme/recipe-box#52' }), size)
      await page.until(`Boolean(document.querySelector('[data-trace-page] [data-trace-step]'))`)
      await settle()
      const shot = path.join(out, `trace-page-${width}-${theme}.png`)
      await page.screenshot(shot)
      console.log(shot)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

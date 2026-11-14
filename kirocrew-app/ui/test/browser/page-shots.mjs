#!/usr/bin/env node
// Screenshots of one harness page (?page=<name>) at 320, 768 and 1280 px
// wide, light and dark: <out>/<name>-<width>-<theme>.png.
//
//   node test/browser/page-shots.mjs <out dir> <page> <selector to wait for> [key=value ...]
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
const [out, name, wait, ...extra] = process.argv.slice(2)
if (!out || !name || !wait) {
  console.error('Usage: page-shots.mjs <out dir> <page> <selector> [key=value ...]')
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
  for (const [width, height] of SIZES)
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: name, theme, ...Object.fromEntries(extra.map((pair) => pair.split('='))) }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector(${JSON.stringify(wait)}))`)
      await page.evaluate('new Promise((r) => setTimeout(r, 200))')
      const file = path.join(out, `${name}-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

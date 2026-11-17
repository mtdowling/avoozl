#!/usr/bin/env node
// Full-app screenshots of Home's In flight with a `process` session (task
// 50.1) on fake data (harness ?page=app&process=1), desktop (1280) and phone
// (390), light and dark: <out>/in-flight-<width>-<theme>.png.
//
//   node test/browser/in-flight-process-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: in-flight-process-shots.mjs <out dir>')
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
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', process: '1', theme }), { width, height: width > 400 ? 900 : 844, dark: theme === 'dark' })
      await page.until(`document.querySelectorAll('[data-in-flight-row]').length === 2`, 30000)
      // The In flight heading at the top, so its card shows whole.
      await page.evaluate(`[...document.querySelectorAll('h2, h3, [data-section-title]')].find((h) => h.textContent.startsWith('In flight ('))?.scrollIntoView({ block: 'start' })`)
      await page.evaluate('new Promise((r) => setTimeout(r, 600))')
      const file = path.join(out, `in-flight-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of the Insights home on fake data (harness ?page=app): with
// data and empty, desktop and phone, light and dark:
// <out>/insights-<full|empty>-<desktop|phone>-<theme>.png.
//
//   node test/browser/insights-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: insights-shots.mjs <out dir>')
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
try {
  const page = await browser.page()
  for (const data of ['full', 'empty'])
    for (const [device, width] of [
      ['desktop', 1280],
      ['phone', 320],
    ])
      for (const theme of ['light', 'dark']) {
        const url = harness.url({ page: 'app', theme, ...(data === 'full' ? { insights: 'full' } : {}) })
        const size = { width, height: 900, dark: theme === 'dark' }
        await page.open(url, size)
        await page.until(`Boolean(document.querySelector('[data-insights-retros]'))`, 30000)
        await page.evaluate('new Promise((r) => setTimeout(r, 300))')
        const pane = await page.evaluate(`document.querySelector('[data-avoozl-pane]').scrollHeight`)
        await page.open(url, { ...size, height: Math.min(4000, Math.ceil(pane) + 120) })
        await page.until(`Boolean(document.querySelector('[data-insights-retros]'))`, 30000)
        await page.evaluate('new Promise((r) => setTimeout(r, 300))')
        const file = path.join(out, `insights-${data}-${device}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Full-page screenshots of Settings › Budgets on the
// harness page with sample data, at 375, 768 and 1280 px wide, light and
// dark: <out>/<page>-<width>-<theme>.png. `--open` also opens every fold.
//
//   node test/browser/settings-shots.mjs <out dir> [--open] [page ...]
//
// AVOOZL_CHROME and AVOOZL_HOST_CSS work as in screenshots.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const WIDTHS = [375, 768, 1280]
const ALL = ['budgets']

const args = process.argv.slice(2)
const open = args.includes('--open')
const [out, ...asked] = args.filter((a) => a !== '--open')
if (!out) {
  console.error('Usage: settings-shots.mjs <out dir> [--open] [page ...]')
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
  for (const name of asked.length ? asked : ALL)
    for (const width of WIDTHS)
      for (const theme of ['light', 'dark']) {
        await page.open(harness.url({ page: name, theme }), { width, height: 800, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-settings-page] button'))`)
        if (open) await page.evaluate(`(() => { document.querySelectorAll('[data-settings-page] details').forEach((d) => (d.open = true)); return true })()`)
        await page.evaluate('new Promise((r) => setTimeout(r, 150))')
        const height = await page.evaluate('Math.ceil(document.documentElement.scrollHeight)')
        await page.open(harness.url({ page: name, theme }), { width, height, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-settings-page] button'))`)
        if (open) await page.evaluate(`(() => { document.querySelectorAll('[data-settings-page] details').forEach((d) => (d.open = true)); return true })()`)
        await page.evaluate('new Promise((r) => setTimeout(r, 150))')
        const file = path.join(out, `${name}-${width}-${theme}${open ? '-open' : ''}.png`)
        await page.screenshot(file)
        console.log(file)
      }
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of the Flow page's GitHub card in the full app, scrolled to it,
// at 1280 and 390 px, light and dark: <out>/flow-<width>-<theme>.png.
// &receipt=only (the default): a repository with build receipts and no Radar
// crew. --receipt=1 is the card with Radar issues too.
//
//   node test/browser/flow-builds-shots.mjs <out dir> [--receipt=1]
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const args = process.argv.slice(2)
const receipt = args.find((a) => a.startsWith('--receipt='))?.slice(10) ?? 'only'
const [out] = args.filter((a) => !a.startsWith('--'))
if (!out) {
  console.error('Usage: flow-builds-shots.mjs <out dir> [--receipt=1]')
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
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
  ])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', receipt, flow: '1', theme }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell]'))`)
      if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
      await page.until(`Boolean(document.querySelector('[data-nav-group="flow"], [data-nav-item="flow"]'))`)
      await page.evaluate(`document.querySelector('[data-nav-group="flow"], [data-nav-item="flow"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-github-flow]'))`)
      if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
      await page.evaluate(`document.querySelector('[data-github-flow]').scrollIntoView({ block: 'start' })`)
      await page.evaluate('new Promise((r) => setTimeout(r, 300))')
      const file = path.join(out, `flow-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

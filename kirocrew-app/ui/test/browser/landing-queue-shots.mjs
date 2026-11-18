#!/usr/bin/env node
// Screenshots of Dashboards › Landing queue inside the full app (harness
// ?page=app&landing=1), desktop 1280 and phone 390, light and dark:
//   landing-<width>-<theme>.png        the busy queue (landing-fixture.ts)
//   landing-empty-<width>-<theme>.png  nothing waits to land
//
//   node test/browser/landing-queue-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: landing-queue-shots.mjs <out dir>')
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
const SIZE = { 1280: 900, 390: 844 }
try {
  const page = await browser.page()
  const settle = (ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  for (const [name, busy] of [
    ['landing', true],
    ['landing-empty', false],
  ])
    for (const theme of ['light', 'dark'])
      for (const width of [1280, 390]) {
        await page.open(harness.url({ page: 'app', theme, ...(busy ? { landing: '1' } : {}) }), { width, height: SIZE[width], dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-shell]'))`)
        if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
        await page.until(`Boolean(document.querySelector('[data-nav-item="dashboard/landing"]'))`)
        await page.evaluate(`document.querySelector('[data-nav-item="dashboard/landing"]').click()`)
        await page.until(`Boolean(document.querySelector(${busy ? `'[data-landing-row]'` : `'[data-landing-empty]'`}))`)
        await settle()
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

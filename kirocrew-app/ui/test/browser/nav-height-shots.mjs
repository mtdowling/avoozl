#!/usr/bin/env node
// Full-app shots of the nav's full height: one pill open, then two, at 1280x800
// and 390x844 (the menu open), light and dark.
//
//   node test/browser/nav-height-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) process.exit(2)
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness()
const browser = await launch(findChrome())
const wait = (page, ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
try {
  const page = await browser.page()
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', theme, needs: '12', specs: '1', activity: '1' }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await wait(page, 1200)
      await page.screenshot(path.join(out, `one-open-${width}-${theme}.png`))
      await page.evaluate(`document.querySelector('[data-nav-group="settings"]').click()`)
      await wait(page)
      await page.screenshot(path.join(out, `two-open-${width}-${theme}.png`))
    }
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of Settings > Plugins > Intake sources on fake data
// (intake-fixture.ts), at 375, 768 and 1280 px wide, light and dark:
// <out>/<prefix>-<width>-<theme>.png, cropped to the Intake sources
// section, plus <prefix>-empty-<width>-<theme>.png with no source and
// <prefix>-add-<width>-<theme>.png with the Add a source dialog open.
//
//   node test/browser/intake-shots.mjs <out dir> [prefix]
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const SIZES = [
  [375, 812],
  [768, 1024],
  [1280, 800],
]
// The section: the new data-intake-sources, or the old Card around the add form.
const SECTION = `document.querySelector('[data-intake-sources]') ? '[data-intake-sources]' : '[data-stub-card]:has([data-intake-source-add])'`
const ADD = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add a source')`

const [out, prefix = 'intake'] = process.argv.slice(2)
if (!out) {
  console.error('Usage: intake-shots.mjs <out dir> [prefix]')
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
  for (const [width, height] of SIZES)
    for (const theme of ['light', 'dark']) {
      const size = { width, height, dark: theme === 'dark' }
      await page.open(harness.url({ page: 'intake', theme }), size)
      await page.until(`Boolean(document.querySelector('[data-intake-source-row]'))`)
      await settle()
      const section = await page.evaluate(SECTION)
      const shot = path.join(out, `${prefix}-${width}-${theme}.png`)
      await page.screenshot(shot, { selector: section })
      console.log(shot)
      if (await page.evaluate(`Boolean(${ADD})`)) {
        await page.evaluate(`(() => { const b = ${ADD}; b.focus(); b.click(); return true })()`)
        await page.until(`Boolean(document.querySelector('[aria-modal="true"]'))`)
        await settle()
        const add = path.join(out, `${prefix}-add-${width}-${theme}.png`)
        await page.screenshot(add)
        console.log(add)
      }
      await page.open(harness.url({ page: 'intake', theme, empty: '1' }), size)
      await page.until(`Boolean(document.querySelector('[data-intake-empty], [data-intake-source-add]'))`)
      await settle()
      const empty = path.join(out, `${prefix}-empty-${width}-${theme}.png`)
      await page.screenshot(empty, { selector: await page.evaluate(SECTION) })
      console.log(empty)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

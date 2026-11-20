#!/usr/bin/env node
// Full-app shots of the Flow metric tiles at 1280 and 375 px, light and dark:
// <out>/tiles-<width>-<theme>.png. With `stops`, the fixture also holds line
// stops, and each shot centers Flow's Line stops list (R64.11) and adds a crop
// of it: <out>/stops-<width>-<theme>.png and stops-<width>-<theme>-list.png.
//
//   node test/browser/flow-tiles-shots.mjs <out dir> [stops]
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out, mode] = process.argv.slice(2)
if (!out) process.exit(2)
const stops = mode === 'stops'
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: await shotCss() })
const browser = await launch(findChrome())
const wait = (page, ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
try {
  const page = await browser.page()
  for (const [width, height] of [
    [1280, stops ? 800 : 500],
    [375, 800],
  ])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', basic: '1', flow: '1', ...(stops ? { stops: '1' } : {}), theme }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await wait(page, 200)
      await page.evaluate(`document.querySelector('[data-nav-group="flow"], [data-nav-item="flow"]').click()`)
      if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)))
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await page.until(`Boolean(document.querySelector('[data-flow-cards]'))`)
      await page.evaluate(
        stops
          ? `(document.querySelector('[data-line-stops]') || document.querySelector('[data-flow-cards]')).scrollIntoView({ block: 'center' })`
          : `document.querySelector('[data-flow-cards]').scrollIntoView({ block: 'start' })`,
      )
      await wait(page, 300)
      const name = `${stops ? 'stops' : 'tiles'}-${width}-${theme}`
      await page.screenshot(path.join(out, `${name}.png`))
      if (stops && (await page.evaluate(`Boolean(document.querySelector('[data-line-stops]'))`)))
        await page.screenshot(path.join(out, `${name}-list.png`), { selector: '[data-line-stops]' })
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

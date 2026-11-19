#!/usr/bin/env node
// Full-app shots of the Retros pill and Flow's nav filters at 1280x800 and
// 390x844, light and dark: Flow with a repository picked, Retros, and
// Proposals reached from a retro's proposal link.
//
//   node test/browser/retros-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) process.exit(2)
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: await shotCss() })
const browser = await launch(findChrome())
const wait = (page, ms = 500) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
try {
  const page = await browser.page()
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ])
    for (const theme of ['light', 'dark']) {
      const phone = width < 768
      const scope = phone ? '[data-top-rail-list]' : '[data-left-nav]'
      const menu = async () => {
        if (phone && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(page, 300)
      }
      const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
      const shot = async (name) => page.screenshot(path.join(out, `${name}-${width}-${theme}.png`))
      await page.open(harness.url({ page: 'app', theme, retros: '1' }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      // Flow, a repository picked: the nav filters and the narrowed page.
      await menu()
      await click(`${scope} [data-nav-group="flow"]`)
      await wait(page, 1200)
      await menu()
      await click(`${scope} [data-nav-filters="avoozl-flow"] [data-rail-chip="acme/pantry"]`)
      await wait(page, 800)
      await shot('flow-filters-nav')
      if (phone) await click('[data-top-rail-bar]')
      await wait(page, 400)
      await shot('flow-filters-page')
      // Retros.
      await menu()
      await click(`${scope} [data-nav-group="retros"]`)
      await wait(page, 1200)
      if (phone) await shot('retros-nav')
      if (phone) await click('[data-top-rail-bar]')
      await wait(page, 400)
      await shot('retros')
      // Proposals, reached from a retro's proposal link, marked.
      await click(`[data-retro-proposal="retro-2:p2"] button`)
      await wait(page, 900)
      await shot('proposals-from-retro')
    }
} finally {
  await browser.close()
  harness.remove()
}

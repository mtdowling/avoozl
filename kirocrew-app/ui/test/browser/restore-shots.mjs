#!/usr/bin/env node
// Screenshots of task 41.6's restored parts in the full app shell (harness
// ?page=app&delivery=1), at 390 and 1280 px, light and dark:
// <out>/<part>-<width>-<theme>.png for Dashboards › Delivery with its nav
// filters and the task drawer's Files fold.
//
//   node test/browser/restore-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: restore-shots.mjs <out dir>')
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
const wait = (page, ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
const button = (text, within = 'document') => `[...${within}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
try {
  const page = await browser.page()
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ])
    for (const theme of ['light', 'dark']) {
      const open = async () => {
        await page.open(harness.url({ page: 'app', theme, delivery: '1' }), { width, height, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        await wait(page, 1000)
      }
      const menu = async (on) => {
        if (width >= 768) return
        const shown = await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)
        if (shown !== on) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(page, 300)
      }
      const nav = async (group, item) => {
        await menu(true)
        await page.evaluate(
          `(() => { const h = document.querySelector('${scope(width)} [data-nav-head][data-nav-group="${group}"]'); if (h && !h.hasAttribute('data-open')) h.click(); return true })()`,
        )
        await wait(page, 200)
        await page.evaluate(`document.querySelector('${scope(width)} [data-nav-item="${group}/${item}"]')?.click()`)
        await wait(page, 500)
      }
      const shot = async (name) => {
        await wait(page, 500)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
      await open()
      await nav('dashboard', 'delivery')
      // A phone shows the menu with the filters first, then the page.
      if (width < 768) {
        await menu(true)
        await page.evaluate(
          `(() => { const h = document.querySelector('${scope(width)} [data-nav-head][data-nav-group="dashboard"]'); if (h && !h.hasAttribute('data-open')) h.click(); return true })()`,
        )
        await wait(page, 300)
        await shot('delivery-filters')
        await menu(false)
      }
      await shot('delivery')
      // The drawer from a card's Details, with Files open.
      await page.evaluate(`${button('Details', "document.querySelector('[data-shell-main]')")}?.click()`)
      await page.until(`Boolean(document.querySelector('[data-section-toggle="files"]'))`)
      await page.evaluate(`(() => { document.querySelector('[data-section-box="files"]').scrollIntoView(); return true })()`)
      await page.until(`Boolean(document.querySelector('[data-file]'))`)
      await page.evaluate(`document.querySelector('[data-file="README.md"]')?.click()`)
      await wait(page, 600)
      await page.evaluate(`document.querySelector('[data-section-box="files"]').scrollIntoView()`)
      await shot('drawer-files')
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

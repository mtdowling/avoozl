#!/usr/bin/env node
// Full-app shots of Retros (failure reasons, chat links, Run again, the log
// tail of a process retro, an old retro with no chat) and Activity (GitHub
// items linked), at 1280 and 390 wide, light and dark.
//
//   node test/browser/retro-links-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) process.exit(2)
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS })
const browser = await launch(findChrome())
const wait = (page, ms = 500) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
try {
  const page = await browser.page()
  for (const [width, height] of [
    [1280, 1500],
    [390, 2200],
  ])
    for (const theme of ['light', 'dark']) {
      const phone = width < 768
      const scope = phone ? '[data-top-rail-list]' : '[data-left-nav]'
      const menu = async () => {
        if (phone && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(page, 300)
      }
      const shot = (name) => page.screenshot(path.join(out, `${name}-${width}-${theme}.png`))
      await page.open(harness.url({ page: 'app', theme, retros: '1' }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      await menu()
      await page.evaluate(`document.querySelector(${JSON.stringify(`${scope} [data-nav-group="retros"]`)}).click()`)
      await page.until(`document.querySelectorAll('[data-retro]').length === 4`)
      if (phone) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await wait(page, 600)
      await shot('retros')
      await page.open(harness.url({ page: 'app', radar: '1', activity: '1', ghitems: '1', theme }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      await wait(page, 1200)
      await menu()
      await page.evaluate(`[...document.querySelectorAll('${scope} [data-nav-head]')].find((x) => x.textContent.includes('Activity')).click()`)
      await page.until(`document.querySelectorAll('[data-activity-item]').length >= 2`)
      if (phone) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await wait(page, 600)
      await shot('activity')
    }
} finally {
  await browser.close()
  harness.remove()
}

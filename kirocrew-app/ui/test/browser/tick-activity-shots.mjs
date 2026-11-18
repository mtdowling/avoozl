#!/usr/bin/env node
// Full-app shots for the tick in Activity: the Tick source row picked in the
// Activity filters, the Needs you row for a tick that keeps failing, and the
// workspace edit dialog without a Tick health block, at 1280x800 and 390x844,
// light and dark: <out>/<view>-<width>-<theme>.png.
//
//   node test/browser/tick-activity-shots.mjs <out dir>
//
// AVOOZL_HOST_CSS names the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) process.exit(2)
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS })
const browser = await launch(findChrome())
const wait = (page, ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const click = (page, selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
try {
  const page = await browser.page()
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ])
    for (const theme of ['light', 'dark']) {
      const phone = width < 768
      const scope = phone ? '[data-top-rail-list]' : '[data-left-nav]'
      const head = (text) => `[...document.querySelectorAll('${scope} [data-nav-head]')].find((x) => x.textContent.includes(${JSON.stringify(text)}))`
      const menu = async () => {
        if (!phone) return
        if (!(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(page, 200)
      }
      const open = async (text) => {
        await menu()
        await page.evaluate(`(() => { const b = ${head(text)}; if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`)
        await wait(page)
      }
      const shot = async (name) => {
        await wait(page)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
      await page.open(harness.url({ page: 'app', radar: '1', activity: '1', tickfail: '1', theme }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      await wait(page, 1200)
      // Activity with the Tick source picked.
      await open('Activity')
      await page.until(`Boolean(document.querySelector('${scope} [data-rail-source="tick"]'))`)
      await click(page, `${scope} [data-rail-source="tick"]`)
      await wait(page, 500)
      await shot('activity-tick-nav')
      if (phone) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await shot('activity-tick')
      }
      // Needs you, with the failing tick's row.
      await open('Needs you')
      await shot('needs-you-tick')
      // The workspace edit dialog has no Tick health block.
      await open('Settings')
      await page.until(`Boolean(document.querySelector('${scope} [data-nav-item="settings/workspaces"]'))`)
      await click(page, `${scope} [data-nav-item="settings/workspaces"]`)
      await page.until(`Boolean(document.querySelector('[data-edit-workspace="w"]'))`)
      await click(page, '[data-edit-workspace="w"]')
      await page.until(`Boolean(document.querySelector('[data-edit-form]'))`)
      await shot('workspace-edit')
      console.log(width, theme, 'tick panel present:', await page.evaluate(`Boolean(document.querySelector('[data-tick-panel]'))`))
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

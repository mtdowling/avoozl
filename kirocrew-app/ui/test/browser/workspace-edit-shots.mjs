#!/usr/bin/env node
// Full-app shots for the workspace edit and folder picker: the pencil's edit
// form, then with Browse open, and the Add dialog's Browse, at 1280x800 and
// 390x844, light and dark.
//
//   node test/browser/workspace-edit-shots.mjs <out dir>
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
      const menu = async () => {
        if (!phone) return
        await page.evaluate(`void (document.querySelector('[data-top-rail-list]') || document.querySelector('[data-top-rail-bar]').click())`)
        await wait(page)
      }
      const name = (shot) => path.join(out, `${shot}-${width}-${theme}.png`)
      await page.open(harness.url({ page: 'app', theme, needs: '12', specs: '1', activity: '1' }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      // Settings › Workspaces: the pencil, then Browse.
      await menu()
      await click(page, `${scope} [data-nav-group="settings"]`)
      await page.until(`Boolean(document.querySelector('${scope} [data-nav-item="settings/workspaces"]'))`)
      await click(page, `${scope} [data-nav-item="settings/workspaces"]`)
      await page.until(`Boolean(document.querySelector('[data-edit-workspace="w"]'))`)
      await click(page, '[data-edit-workspace="w"]')
      await page.until(`Boolean(document.querySelector('[data-edit-form]'))`)
      await wait(page)
      await page.screenshot(name('edit'))
      await click(page, '#avoozl-ws-edit-root ~ [data-folder-browse]')
      await page.until(`Boolean(document.querySelector('[data-folder="plans"]'))`)
      await click(page, '[data-folder="plans"]')
      await page.until(`Boolean(document.querySelector('[data-folder="launch"]'))`)
      await wait(page)
      await page.screenshot(name('edit-browse'))
      await click(page, '[data-edit-workspace-modal] [data-modal-footer-close]')
      await wait(page)
      // Add a workspace, with ~/ typed and Browse open.
      await click(page, '[data-add-workspace]')
      await page.until(`Boolean(document.querySelector('#avoozl-ws-root'))`)
      await page.evaluate(`(() => {
        const el = document.querySelector('#avoozl-ws-root')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '~/plans')
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
      await click(page, '#avoozl-ws-root ~ [data-folder-browse]')
      await page.until(`Boolean(document.querySelector('[data-folder="launch"]'))`)
      await wait(page)
      await page.screenshot(name('add-browse'))
    }
} finally {
  await browser.close()
  harness.remove()
}

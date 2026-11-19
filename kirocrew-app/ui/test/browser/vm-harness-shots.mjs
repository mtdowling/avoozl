#!/usr/bin/env node
// Screenshots of the vm-harness screens at 390 and 1280 px, light and dark:
// the Isolation panel with contained agent commands and stranger input on
// this machine (<out>/isolation-...png), and the Needs you items for
// stranger input that waits and a failed box preflight (<out>/stranger-...png).
//
//   node test/browser/vm-harness-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: vm-harness-shots.mjs <out dir>')
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
const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
const openMenu = (width) =>
  width >= 768 ? 'true' : `(() => { if (!document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`
const closeMenu = (width) =>
  width >= 768 ? 'true' : `(() => { if (document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`
const head = (width, text) =>
  `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`
const item = (width, text) =>
  `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-item]:not([data-nav-head])')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
const click = (selector, text) =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => !x.disabled && (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
try {
  const page = await browser.page()
  const settle = (ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  const shot = async (name, width, theme) => {
    const file = path.join(out, `${name}-${width}-${theme}.png`)
    await page.screenshot(file)
    console.log(file)
  }
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      const size = { width, height: 900, dark: theme === 'dark' }
      // The Isolation panel: Settings › Repository setup › Edit › Landing.
      await page.open(harness.url({ page: 'app', basic: '1', theme, roles: 'plans', strangerhost: '1' }), size)
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      for (const step of [
        openMenu(width),
        head(width, 'Settings'),
        item(width, 'Repository setup'),
        click('[data-repository-list] button', 'Edit recipe-box'),
        `(() => { document.querySelector('[data-repository-edit] [role=tab][data-tab="landing"]')?.click(); return true })()`,
      ]) {
        await settle()
        await page.evaluate(step)
      }
      await settle(600)
      await page.evaluate(`document.querySelector('[data-isolation-worker]')?.scrollIntoView({ block: 'start' })`)
      await settle()
      await shot('isolation', width, theme)
      await page.evaluate(`document.querySelector('[data-isolation-stranger-warning]')?.scrollIntoView({ block: 'center' })`)
      await settle()
      await shot('isolation-strangers', width, theme)
      // Needs you › Decisions: the list, then each item opened from it.
      for (const [name, text] of [
        ['stranger-list', null],
        ['stranger-kirocrew', 'a Kiro Crew chat never takes it'],
        ['stranger-preflight', 'the box preflight failed'],
      ]) {
        await page.open(harness.url({ page: 'app', theme, stranger: '1' }), size)
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        await settle(1200)
        for (const step of [openMenu(width), head(width, 'Needs you'), item(width, 'Decisions'), closeMenu(width)]) {
          await page.evaluate(step)
          await settle(300)
        }
        if (text)
          await page.evaluate(
            `[...document.querySelectorAll('[data-shell-main] *')].filter((el) => el.children.length === 0 && el.textContent.includes(${JSON.stringify(text)})).at(0)?.click()`,
          )
        await settle(600)
        await shot(name, width, theme)
      }
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

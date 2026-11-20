#!/usr/bin/env node
// Screenshots of the left nav and its pages (harness ?page=app with a long
// workspace name, 12 Needs you items, specs and activity rows), at 390 px
// (the phone's menu open) and 1280 px, light and dark:
// <out>/<view>-<width>-<theme>.png for Home, Needs you, Specs, Activity,
// Lanes and the open workspace menu.
//
//   node test/browser/nav-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: nav-shots.mjs <out dir>')
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
const wait = (page, ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
// The nav's scope: the left nav on a desktop, the open menu on a phone.
const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
const head = (width, text) => `[...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes(${JSON.stringify(text)}))`
try {
  const page = await browser.page()
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', theme, needs: '12', long: '1', specs: '1', activity: '1' }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      await wait(page, 1200)
      const shot = async (name) => {
        await wait(page)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
      const menu = async () => {
        if (width >= 768) return
        if (!(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(page, 200)
      }
      const open = async (text) => {
        await menu()
        await page.evaluate(`(() => { const b = ${head(width, text)}; if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`)
      }
      await shot('home-page')
      await open('Dashboards')
      await shot('home')
      await open('Needs you')
      await shot('needs-you')
      await open('Specs')
      await shot('specs')
      // The rest of the Specs rail, scrolled inside its pill: the filter
      // rows and the Epics chips, with Last update and one epic picked.
      if (await page.evaluate(`Boolean(document.querySelector('${scope(width)} [data-rail-chip]'))`)) {
        await page.evaluate(`document.querySelector('${scope(width)} [data-rail-sort="updated"]').click()`)
        await page.evaluate(`document.querySelector('${scope(width)} [data-rail-chip="runtime"]').click()`)
        await wait(page, 200)
        await page.evaluate(
          `(() => { const chip = document.querySelector('${scope(width)} [data-rail-chip]'); let el = chip.parentElement; while (el && !(el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; if (el) el.scrollTop = el.scrollHeight })()`,
        )
        await shot('specs-rail')
        await page.evaluate(`document.querySelector('${scope(width)} [data-rail-chip="runtime"]').click()`)
        await page.evaluate(`document.querySelector('${scope(width)} [data-rail-sort="name"]').click()`)
      }
      if (width < 768) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await shot('specs-page')
      }
      await open('Activity')
      await shot('activity')
      // The rest of the Activity rail, scrolled inside its pill: GitHub and
      // one kind picked, down to Keep activity.
      if (await page.evaluate(`Boolean(document.querySelector('${scope(width)} [data-rail-source="github"]'))`)) {
        await page.evaluate(`document.querySelector('${scope(width)} [data-rail-source="github"]').click()`)
        await page.evaluate(`document.querySelector('${scope(width)} [data-rail-chip="settings"]').click()`)
        await wait(page, 300)
        await page.evaluate(
          `(() => { const keep = document.querySelector('${scope(width)} #avoozl-activity-keep'); let el = keep.parentElement; while (el && !(el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; if (el) el.scrollTop = el.scrollHeight })()`,
        )
        await shot('activity-rail')
        await page.evaluate(`document.querySelector('${scope(width)} [data-rail-source=""]').click()`)
        await page.evaluate(`document.querySelector('${scope(width)} [data-rail-chip="settings"]').click()`)
        await wait(page, 300)
      }
      if (width < 768) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await shot('activity-page')
        await menu()
      }
      await menu()
      await page.evaluate(`document.querySelector('${scope(width)} [data-workspace-pill]')?.click()`)
      await shot('workspace-menu')
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

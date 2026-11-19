#!/usr/bin/env node
// Screenshots of Issue Radar escalations in the full app shell (harness
// ?page=app&escalations=before|after), at 390 and 1280 px, light and dark:
// <out>/<state>-<page>-<width>-<theme>.png for Needs you's Intake page and
// its decisions page.
//
//   node test/browser/escalation-shots.mjs <out dir> [before|after ...]
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out, ...states] = process.argv.slice(2)
if (!out) {
  console.error('Usage: escalation-shots.mjs <out dir> [before|after ...]')
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
try {
  const page = await browser.page()
  for (const state of states.length ? states : ['before', 'after'])
    for (const [width, height] of [
      [390, 844],
      [1280, 800],
    ])
      for (const theme of ['light', 'dark']) {
        await page.open(harness.url({ page: 'app', theme, escalations: state }), { width, height, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        await wait(page, 1200)
        const menu = async () => {
          if (width >= 768) return
          if (!(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
          await wait(page, 200)
        }
        const pick = async (text) => {
          await menu()
          await page.evaluate(
            `(() => { const h = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes('Needs you')); if (h && !h.hasAttribute('data-open')) h.click(); return true })()`,
          )
          await wait(page, 200)
          await page.evaluate(
            `[...document.querySelectorAll('${scope(width)} [data-nav-item]:not([data-nav-head])')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))?.click()`,
          )
          await wait(page, 300)
          if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)))
            await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        }
        const shot = async (name) => {
          await wait(page, 600)
          const file = path.join(out, `${state}-${name}-${width}-${theme}.png`)
          await page.screenshot(file)
          console.log(file)
        }
        await pick('Triage')
        await shot('intake')
        await pick('Decisions')
        // Open the crew row so its actions show beside the list.
        await page.evaluate(
          `[...document.querySelectorAll('[data-shell-main] li, [data-shell-main] [role="button"]')].find((el) => el.textContent.includes('#38 needs a person'))?.click()`,
        )
        await wait(page, 400)
        await page.evaluate(
          `[...document.querySelectorAll('[data-shell-main] *')].filter((el) => el.children.length === 0 && el.textContent.includes('#38 needs a person')).at(0)?.click()`,
        )
        await shot('needs-you')
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of the triage agent's screens inside the full app (harness
// ?page=app&agent=1), desktop 1280 and phone 390, light and dark:
//   issues-<width>-<theme>.png        GitHub › Issues with one issue open
//   pulls-<width>-<theme>.png         GitHub › Pull requests with one open
//   agent-<width>-<theme>.png         GitHub › Triage agent
//   owner-<width>-<theme>.png         Needs you › From the agent
//   home-<width>-<theme>.png          Home, whose Needs you counts the queue
//   new-fix-<width>-<theme>.png       New fix (beside New spec on Specs)
//
//   node test/browser/triage-agent-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: triage-agent-shots.mjs <out dir>')
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
const SIZE = { 1280: 900, 390: 844 }
// Each screen: the nav item to press, what to wait for, and what to do there.
const SCREENS = [
  ['issues', 'github/issues', '[data-item-row]', `document.querySelector('[data-item-row="acme/recipe-box#142"] button').click()`, '[data-item-detail]'],
  ['pulls', 'github/pulls', '[data-item-row]', `document.querySelector('[data-item-row="acme/recipe-box#145"] button').click()`, '[data-item-detail]'],
  ['agent', 'github/agent', '[data-triage-run]', null, null],
  ['owner', 'waiting/agent', '[data-item-row]', null, null],
  ['home', null, '[data-shell]', null, null],
]
try {
  const page = await browser.page()
  const settle = (ms = 500) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  for (const [name, nav, ready, then, after] of SCREENS)
    for (const theme of ['light', 'dark'])
      for (const width of [1280, 390]) {
        await page.open(harness.url({ page: 'app', theme, agent: '1' }), { width, height: SIZE[width], dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-shell]'))`)
        if (nav) {
          if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
          const [group, sub] = nav.split('/')
          const target = sub ? `[data-nav-item="${nav}"]` : `[data-nav-group="${group}"], [data-nav-item="${group}"]`
          if (sub) await page.evaluate(`document.querySelector('[data-nav-group="${group}"]')?.click()`)
          await page.until(`Boolean(document.querySelector('${target}'))`)
          await page.evaluate(`document.querySelector('${target}').click()`)
        }
        await page.until(`Boolean(document.querySelector('${ready}'))`)
        await settle()
        if (then) {
          await page.evaluate(then)
          await page.until(`Boolean(document.querySelector('${after}'))`)
          await settle()
        }
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  // New fix, as its own dialog (the Specs page draws its button beside New spec).
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      await page.open(harness.url({ modal: 'new-fix', theme }), { width, height: SIZE[width], dark: theme === 'dark' })
      await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog')?.click()`)
      await page.until(`Boolean(document.querySelector('[data-new-fix-drawer]'))`)
      await settle()
      const file = path.join(out, `new-fix-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

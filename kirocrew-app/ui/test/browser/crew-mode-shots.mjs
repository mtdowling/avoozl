#!/usr/bin/env node
// Screenshots of the Crew Mode hold in Needs you (harness ?page=app&crewmode=1)
// at 390 and 1280 px, light and dark: <out>/crew-mode-<width>-<theme>.png,
// and the confirm after Let the tick run it: <out>/crew-mode-confirm-...png.
//
//   node test/browser/crew-mode-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: crew-mode-shots.mjs <out dir>')
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
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', theme, crewmode: '1' }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      await wait(page, 1200)
      if (width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await wait(page, 200)
      await page.evaluate(`(() => { const h = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes('Needs you')); if (h && !h.hasAttribute('data-open')) h.click(); return true })()`)
      await wait(page, 200)
      await page.evaluate(`[...document.querySelectorAll('${scope(width)} [data-nav-item]:not([data-nav-head])')].find((b) => b.textContent.trim().startsWith('Decisions'))?.click()`)
      await wait(page, 300)
      if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await page.evaluate(`[...document.querySelectorAll('[data-shell-main] *')].filter((el) => el.children.length === 0 && el.textContent.includes('The tick does not start this workspace yet')).at(0)?.click()`)
      await wait(page, 600)
      const shot = async (name) => {
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
      await shot('crew-mode')
      await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Let the tick run it')?.click()`)
      await wait(page, 500)
      await shot('crew-mode-confirm')
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

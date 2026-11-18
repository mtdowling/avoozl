#!/usr/bin/env node
// Screenshots of Home in the full app shell (harness ?page=app&home=1, a
// busy workspace), at 390 and 1280 px, light and dark, each as tall as Home:
// <out>/home-<width>-<theme>.png. &empty=1 shoots an empty workspace too:
// <out>/home-empty-<width>-<theme>.png.
//
//   node test/browser/home-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: home-shots.mjs <out dir>')
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
// Home's bottom edge in page pixels, wherever the shell scrolls it.
const BOTTOM = `(() => { const home = document.querySelector('[data-home]'); let el = home.parentElement; while (el && el !== document.body) { const y = getComputedStyle(el).overflowY; if (y === 'auto' || y === 'scroll') break; el = el.parentElement } return Math.ceil(home.getBoundingClientRect().bottom + (el && el !== document.body ? el.scrollTop : 0) + 24) })()`
try {
  const page = await browser.page()
  for (const [name, query] of [
    ['home', { home: '1' }],
    ['home-empty', { home: 'empty' }],
  ])
    for (const width of [390, 1280])
      for (const theme of ['light', 'dark']) {
        const url = harness.url({ page: 'app', theme, ...query })
        const open = async (height) => {
          await page.open(url, { width, height, dark: theme === 'dark' })
          await page.until(`Boolean(document.querySelector('[data-home-tiles]'))`)
          await wait(page, 900)
        }
        await open(900)
        const height = Math.min(5000, Math.max(900, await page.evaluate(BOTTOM)))
        await open(height)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

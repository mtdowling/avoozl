#!/usr/bin/env node
// Screenshots of Demo mode on the whole page, from the real sample's replies,
// at 320, 768 and 1280 px wide, light and dark: <out>/<view>-<width>-<theme>.png
// for Home (with the demo bar) and Specs. Also used by test/demo-mode.test.mjs.
//
//   node test/browser/demo-screenshots.mjs <out dir> [view ...]
//
// AVOOZL_CHROME names the browser. AVOOZL_HOST_CSS names the host's own
// stylesheet, so the page looks like the real one.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'
import { demoReplies, demoScript } from './demo-replies.mjs'

export const SIZES = [
  [320, 640],
  [768, 1024],
  [1280, 800],
]
export const THEMES = ['light', 'dark']
// The nav section each view opens; Home is where the demo starts.
const VIEWS = { home: null, specs: 'Specs' }

// Open the demo page, start the demo, open `view`, and return what the
// layout checks need: the demo bar's box and the page's widths.
export async function showDemo(page, harness, { width, height, theme, view = 'home' }) {
  await page.open(harness.url({ page: 'demo', theme }), { width, height, dark: theme === 'dark' })
  const start = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start demo')`
  await page.until(`Boolean(${start})`)
  await page.evaluate(`(() => { ${start}.click(); return true })()`)
  await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
  const section = VIEWS[view]
  if (section) {
    if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
    await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-nav-head]')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(section)})); b?.click(); return Boolean(b) })()`)
    if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-list]') && document.querySelector('[data-top-rail-bar]')?.click()`)
  }
  // Let the page's reads settle.
  await page.evaluate('new Promise((r) => setTimeout(r, 400))')
  return page.evaluate(`(() => {
    const box = document.querySelector('[data-demo-bar]').getBoundingClientRect()
    return { left: box.left, right: box.right, inner: innerWidth, scroll: document.documentElement.scrollWidth, badge: Boolean(document.querySelector('[data-demo-badge]')) }
  })()`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...asked] = process.argv.slice(2)
  if (!out) {
    console.error('Usage: demo-screenshots.mjs <out dir> [view ...]')
    process.exit(2)
  }
  const chrome = findChrome()
  if (!chrome) {
    console.error('No Chrome found; set AVOOZL_CHROME.')
    process.exit(1)
  }
  fs.mkdirSync(out, { recursive: true })
  const harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS, scripts: { 'demo.js': demoScript(await demoReplies()) } })
  const browser = await launch(chrome)
  try {
    const page = await browser.page()
    for (const view of asked.length ? asked : Object.keys(VIEWS))
      for (const [width, height] of SIZES)
        for (const theme of THEMES) {
          await showDemo(page, harness, { width, height, theme, view })
          const file = path.join(out, `demo-${view}-${width}-${theme}.png`)
          await page.screenshot(file)
          console.log(file)
        }
  } finally {
    await browser.close()
    harness.remove()
  }
  process.exit(0)
}

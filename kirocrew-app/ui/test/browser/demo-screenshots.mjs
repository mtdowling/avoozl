#!/usr/bin/env node
// Screenshots of the Demo mode tour on the whole page, from the real
// sample's replies, at 320, 768 and 1280 px wide, light and dark:
// <out>/<step>-<width>-<theme>.png. Also used by test/demo-tour.test.mjs.
//
//   node test/browser/demo-screenshots.mjs <out dir> [step ...]
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
const TOUR_IDS = ['dashboard', 'specs', 'graph', 'task', 'intake', 'flow', 'needs-you', 'stop-line', 'settings']

// Open the demo page, start the demo, step to `step`, and return what the
// layout checks need: the tour card's box and the page's widths.
export async function showStep(page, harness, { width, height, theme, step }) {
  await page.open(harness.url({ page: 'demo', theme }), { width, height, dark: theme === 'dark' })
  const start = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Try the demo')`
  await page.until(`Boolean(${start})`)
  await page.evaluate(`(() => { ${start}.click(); return true })()`)
  await page.until(`document.querySelector('[data-demo-tour]')?.dataset.step === 'dashboard'`)
  for (let i = 0; i < TOUR_IDS.indexOf(step); i++) {
    const at = TOUR_IDS[i + 1]
    await page.evaluate(`(() => { [...document.querySelectorAll('[data-demo-tour] button')].find((b) => b.textContent.trim() === 'Next').click(); return true })()`)
    await page.until(`document.querySelector('[data-demo-tour]')?.dataset.step === ${JSON.stringify(at)}`)
  }
  // Let the page's reads settle and the step's target scroll into view.
  await page.evaluate('new Promise((r) => setTimeout(r, 300))')
  return page.evaluate(`(() => {
    const box = document.querySelector('[data-demo-tour]').getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, inner: innerWidth, innerHeight, scroll: document.documentElement.scrollWidth, badge: Boolean(document.querySelector('[data-demo-badge]')) }
  })()`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...asked] = process.argv.slice(2)
  if (!out) {
    console.error('Usage: demo-screenshots.mjs <out dir> [step ...]')
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
    for (const step of asked.length ? asked : TOUR_IDS)
      for (const [width, height] of SIZES)
        for (const theme of THEMES) {
          await showStep(page, harness, { width, height, theme, step })
          const file = path.join(out, `${step}-${width}-${theme}.png`)
          await page.screenshot(file)
          console.log(file)
        }
  } finally {
    await browser.close()
    harness.remove()
  }
}

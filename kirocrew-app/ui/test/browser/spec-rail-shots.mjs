#!/usr/bin/env node
// The spec view's resizable right rail, in the full app on demo data: at
// 1280 px with the specs list narrowed to its minimum, the rail at its
// default width and dragged to its widest, light and dark; and at 390 px,
// where the rail stacks under the cards with no handle.
//
//   AVOOZL_HOST_CSS=<host css> node test/browser/spec-rail-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'
import { demoReplies, demoScript } from './demo-replies.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: spec-rail-shots.mjs <out dir>')
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
  const wait = (ms = 300) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
  const button = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
  const box = (sel) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { left: r.left, top: r.top } })()`)
  const open = async (width, dark) => {
    const url = harness.url({ page: 'demo', theme: dark ? 'dark' : 'light' })
    await page.open(url, { width, height: 900, dark })
    await page.evaluate('localStorage.clear()')
    await page.open(url, { width, height: 900, dark })
    await page.until(`Boolean(${button('Start demo')})`)
    await click(button('Start demo'))
    await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
    if (width < 768) {
      await click(`document.querySelector('[data-top-rail-bar]')`)
      await wait(150)
    }
    await click(`document.querySelector('[data-nav-group="plans"]')`)
    if (width < 768) await click(`document.querySelector('[data-top-rail-bar]')`)
    await page.until(`Boolean(document.querySelector('[data-plans-list]'))`)
    await click(button('Meal planner', `document.querySelector('[data-plans-list]')`))
    await page.until(`Boolean(document.querySelector('[data-spec-rail] [data-state-count]'))`)
    await wait(500)
  }
  for (const theme of ['light', 'dark']) {
    const dark = theme === 'dark'
    await open(1280, dark)
    const list = await box('[data-list-detail] > [data-resize-handle]')
    await page.drag(list.left + 4, list.top + 200, 0)
    await wait()
    await page.screenshot(path.join(out, `spec-1280-${theme}-default.png`))
    const rail = await box('[data-spec-body] > [data-resize-handle]')
    await page.drag(rail.left + 4, rail.top + 60, 0)
    await page.hover(rail.left - 200, rail.top + 60)
    await wait()
    await page.screenshot(path.join(out, `spec-1280-${theme}-wider.png`))
    await open(390, dark)
    await page.screenshot(path.join(out, `spec-390-${theme}.png`))
    console.log(`${theme}: done`)
  }
} finally {
  await browser.close()
  harness.remove()
}

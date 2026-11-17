#!/usr/bin/env node
// The spec view's details panel under the spec, in the full app on demo
// data, light and dark: at 1280 px shown at its default height, hidden, and
// dragged 200 px taller; at 390 px stacked under the spec, shown and hidden.
//
//   AVOOZL_HOST_CSS=<host css> node test/browser/spec-details-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'
import { demoReplies, demoScript } from './demo-replies.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: spec-details-shots.mjs <out dir>')
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
  const box = (sel) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width } })()`)
  const toggle = `document.querySelector('[data-spec-panel-toggle]')`
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
    await page.screenshot(path.join(out, `spec-1280-${theme}-shown.png`))
    const bar = await box('[data-spec-panel-divider]')
    await page.drag(bar.left + 200, bar.top + 4, bar.left + 200, 8, bar.top + 4 - 200)
    await wait()
    await page.screenshot(path.join(out, `spec-1280-${theme}-resized.png`))
    await click(toggle)
    await wait()
    await page.screenshot(path.join(out, `spec-1280-${theme}-hidden.png`))
    await open(390, dark)
    // The panel's bar just under the sticky Back row.
    await page.evaluate(`(() => { const pane = document.querySelector('[data-avoozl-pane]'); const bar = document.querySelector('[data-spec-panel-bar]').getBoundingClientRect(); const row = document.querySelector('[data-detail-bar]').getBoundingClientRect(); pane.scrollTop += bar.top - row.bottom - 8 })()`)
    await wait()
    await page.screenshot(path.join(out, `spec-390-${theme}-shown.png`))
    await click(toggle)
    await wait()
    await page.evaluate(`document.querySelector('[data-spec-panel]').scrollIntoView({ block: 'end' })`)
    await wait()
    await page.screenshot(path.join(out, `spec-390-${theme}-hidden.png`))
    console.log(`${theme}: done`)
  }
} finally {
  await browser.close()
  harness.remove()
}

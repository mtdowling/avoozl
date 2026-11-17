#!/usr/bin/env node
// Screenshots of the task details Timeline box inside the full app (harness
// ?page=app): desktop 1280 and phone 390, light and dark, The viewport is tall
// so the whole drawer shows. The task opens from Home's Needs you row
// (Details), the way a person opens it.
// <out>/task-timeline-<width>-<theme>.png
//
//   node test/browser/task-timeline-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: task-timeline-shots.mjs <out dir>')
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
const HEIGHT = { 1280: 1700, 390: 2300 }
const button = (text) => `[...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}) || b.getAttribute('aria-label') === ${JSON.stringify(text)})`
// Waits for the button, then clicks it in the same step, so a re-render in
// between can't drop it.
const press = (text) => `(() => { const b = ${button(text)}; b?.click(); return Boolean(b) })()`
try {
  const page = await browser.page()
  const settle = (ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  const open = async (width, theme) => {
    await page.open(harness.url({ page: 'app', needs: '1', theme }), { width, height: HEIGHT[width], dark: theme === 'dark' })
    await page.until(press('Details for Item 1'), 10000)
    await page.until(`Boolean(document.querySelector('#avoozl-drawer-title'))`, 10000)
    await settle(800)
  }
  const shoot = async (name) => {
    const file = path.join(out, `${name}.png`)
    await page.screenshot(file)
    console.log(file)
  }
  // The Timeline box is the last one in the drawer: scroll it into view.
  const SCROLLER = `(() => { let el = document.querySelector('#avoozl-drawer-title'); while (el && el !== document.body) { const y = getComputedStyle(el).overflowY; if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight + 4) return el; el = el.parentElement } return null })()`
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      await open(width, theme)
      await page.evaluate(`(() => { const el = ${SCROLLER}; if (el) el.scrollTop = el.scrollHeight; return true })()`)
      await settle()
      await shoot(`task-timeline-${width}-${theme}`)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

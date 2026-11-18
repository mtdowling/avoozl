#!/usr/bin/env node
// Screenshots of the task details drawer inside the full app (harness
// ?page=app): the tab bar and Overview's Edges lists, the Details tab's
// source snippet, and Overview for a task with no edges. Desktop 1280 and
// phone 390, light and dark. The task opens from Home's Needs you row.
// <out>/<shot>-<width>-<theme>.png
//
//   node test/browser/task-view-followups-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: task-view-followups-shots.mjs <out dir>')
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
const HEIGHT = { 1280: 1000, 390: 1100 }
const press = (text) => `(() => { const b = [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}) || b.getAttribute('aria-label') === ${JSON.stringify(text)}); b?.click(); return Boolean(b) })()`
try {
  const page = await browser.page()
  const settle = (ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  const open = async (width, theme, extra = {}) => {
    await page.open(harness.url({ page: 'app', needs: '1', theme, summary: 'ready', ...extra }), { width, height: HEIGHT[width], dark: theme === 'dark' })
    await page.until(press('Details for Item 1'), 10000)
    await page.until(`Boolean(document.querySelector('[data-tabs="task-tabs"]'))`, 10000)
    await settle(800)
  }
  const shoot = async (name) => {
    const file = path.join(out, `${name}.png`)
    await page.screenshot(file)
    console.log(file)
  }
  const into = (sel) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el?.scrollIntoView({ block: 'start' }); return Boolean(el) })()`)
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      await open(width, theme)
      await into('[data-section-box="links"]')
      await settle()
      await shoot(`overview-edges-${width}-${theme}`)
      await page.evaluate(`document.querySelector('[data-tabs="task-tabs"] [data-tab="details"]').click()`)
      await page.until(`document.querySelector('[data-tab-panel]')?.dataset.tabPanel === 'details'`, 5000)
      await settle(800)
      await into('[data-origin]')
      await settle()
      await shoot(`details-source-${width}-${theme}`)
      await open(width, theme, { edges: 'none' })
      await shoot(`overview-no-edges-${width}-${theme}`)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

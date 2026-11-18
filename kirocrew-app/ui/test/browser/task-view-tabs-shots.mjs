#!/usr/bin/env node
// Screenshots of the task details drawer inside the full app (harness
// ?page=app): desktop 1280 and phone 390, light and dark, plus one shot with
// a section folded when the drawer has foldable boxes. The viewport is tall
// so the whole drawer shows. The task opens from Home's Needs you row
// (Details), the way a person opens it.
// <out>/tabs-<tab>-<width>-<theme>.png, and tabs-working-<width>-light.png while the summary is written
//
//   node test/browser/task-view-tabs-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: task-view-tabs-shots.mjs <out dir>')
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
const button = (text) => `[...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}) || b.getAttribute('aria-label') === ${JSON.stringify(text)})`
// Waits for the button, then clicks it in the same step, so a re-render in
// between can't drop it.
const press = (text) => `(() => { const b = ${button(text)}; b?.click(); return Boolean(b) })()`
try {
  const page = await browser.page()
  const settle = (ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  const open = async (width, theme, summary = 'ready') => {
    await page.open(harness.url({ page: 'app', needs: '1', theme, summary }), { width, height: HEIGHT[width], dark: theme === 'dark' })
    await page.until(press('Details for Item 1'), 10000)
    await page.until(`Boolean(document.querySelector('#avoozl-drawer-title'))`, 10000)
    await settle(800)
  }
  const shoot = async (name) => {
    const file = path.join(out, `${name}.png`)
    await page.screenshot(file)
    console.log(file)
  }
  const tab = async (key) => {
    await page.evaluate(`document.querySelector('[data-tabs="task-tabs"] [data-tab="${key}"]').click()`)
    await page.until(`document.querySelector('[data-tab-panel]')?.dataset.tabPanel === '${key}'`, 5000)
    await settle(500)
  }
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      await open(width, theme)
      await shoot(`tabs-overview-${width}-${theme}`)
      // Only the tabs the task has data for are in the bar.
      const keys = await page.evaluate(`[...document.querySelectorAll('[data-tabs="task-tabs"] [role=tab]')].map((t) => t.dataset.tab).filter((k) => k !== 'overview')`)
      for (const key of keys) {
        await tab(key)
        await shoot(`tabs-${key}-${width}-${theme}`)
      }
    }
  for (const width of [1280, 390]) {
    await open(width, 'light', 'none')
    await settle(300)
    await shoot(`tabs-working-${width}-light`)
  }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

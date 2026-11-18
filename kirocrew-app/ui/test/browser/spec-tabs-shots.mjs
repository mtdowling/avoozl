#!/usr/bin/env node
// Full-app screenshots of a spec's page (&review=1), one per tab: Overview
// (also while the AI working box shows), Tasks, each document, and Review
// (also with Blocker and Warn on); 1280 and 390 px, light and dark.
//   node test/browser/spec-tabs-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: spec-tabs-shots.mjs <out dir>')
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
const click = (selector) => `document.querySelector(${JSON.stringify(selector)}).click()`
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark'])
      for (const name of ['overview-working', 'overview', 'tasks', 'requirements', 'design', 'tasks-md', 'manifest', 'review', 'review-toggles']) {
        const url = harness.url({ page: 'app', radar: '1', specs: '1', review: '1', theme, ...(name === 'overview-working' ? { summary: 'running' } : {}) })
        await page.open(url, { width, height: width > 400 ? 1300 : 2200, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
        if (width < 768) {
          await page.evaluate(click('[data-top-rail-bar]'))
          await settle()
          await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
          await settle()
          if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)) await page.evaluate(click('[data-top-rail-bar]'))
        } else await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
        await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
        await page.evaluate(click('[data-plan-row="spec:byte-types"]'))
        await page.until(`Boolean(document.querySelector('[data-spec-summary]'))`, 30000)
        await page.until(`Boolean(document.querySelector('[data-spec-graph] [data-frontier]'))`, 30000)
        const tab = { tasks: 'tasks', requirements: 'requirements.md', design: 'design.md', 'tasks-md': 'tasks.md', manifest: 'avoozl/manifest.json', review: 'review', 'review-toggles': 'review' }[name]
        if (tab) {
          await page.evaluate(click(`[data-spec-tab="${tab}"]`))
          await settle()
        }
        if (name === 'review-toggles') {
          await page.until(`Boolean(document.querySelector('[data-review-tab="all"]'))`, 30000)
          await page.evaluate(click('[data-review-tab="all"]'))
          await settle()
          await page.evaluate(click('[data-severity-filter="blocker"]'))
          await page.evaluate(click('[data-severity-filter="warn"]'))
          await settle()
        }
        await settle()
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of a planner batch (R108.9, task 61.1) on fake data (harness
// ?page=app&delivery=1&batch=1): Delivery's In progress lane with one card
// for the batch of three, its reason and its tasks, beside a grouped task
// that runs alone with its reason; then a member's details with its Batch
// box. 1280 and 390, light and dark:
// <out>/delivery-<width>-<theme>.png and <out>/details-<width>-<theme>.png.
//
//   node test/browser/agent-batching-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: agent-batching-shots.mjs <out dir>')
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
try {
  const page = await browser.page()
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', delivery: '1', batch: '1', theme }), { width, height: width > 400 ? 900 : 844, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
      if (width < 768) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
      }
      await page.evaluate(`(() => { const h = document.querySelector('${scope} [data-nav-head][data-nav-group="dashboard"]'); if (h && !h.hasAttribute('data-open')) h.click(); return true })()`)
      await page.until(`Boolean(document.querySelector('${scope} [data-nav-item="dashboard/delivery"]'))`)
      await page.evaluate(`document.querySelector('${scope} [data-nav-item="dashboard/delivery"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-batch-card]'))`, 30000)
      // On a phone the lanes fold: open In progress and bring the batch in view.
      await page.evaluate(`(() => { const card = document.querySelector('[data-batch-card]'); const lane = card.closest('details'); if (lane) lane.open = true; card.scrollIntoView({ block: 'start' }); return true })()`)
      await page.evaluate('new Promise((r) => setTimeout(r, 600))')
      const facts = await page.evaluate(`(() => ({
        batchCards: document.querySelectorAll('[data-batch-card]').length,
        members: [...document.querySelectorAll('[data-batch-member]')].map((m) => m.dataset.batchMember),
        alone: [...document.querySelectorAll('[data-runs-alone]')].map((m) => m.textContent.trim()),
        memberCards: [...document.querySelectorAll('[data-lane-card] [data-task-title]')].map((m) => m.dataset.taskTitle).filter((id) => ['m6', 'm7'].includes(id)).length,
      }))()`)
      const file = path.join(out, `delivery-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file, JSON.stringify(facts))
      await page.evaluate(`document.querySelector('[data-batch-member="m6"] button').click()`)
      await page.until(`Boolean(document.querySelector('[data-task-batch]'))`, 30000)
      await page.evaluate(`(() => { document.querySelector('[data-task-batch]').scrollIntoView({ block: 'center' }); return true })()`)
      await page.evaluate('new Promise((r) => setTimeout(r, 600))')
      const details = path.join(out, `details-${width}-${theme}.png`)
      await page.screenshot(details)
      console.log(details, await page.evaluate(`document.querySelector('[data-task-batch]').textContent`))
    }
} finally {
  await browser.close()
  harness.remove()
}

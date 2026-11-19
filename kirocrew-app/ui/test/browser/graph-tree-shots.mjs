#!/usr/bin/env node
// Screenshots of Dashboards › Graph on a scratch workspace with real chains
// (graph-chains.ts), at 1280 and 390 px wide, light and dark:
// <out>/<step>-<width>-<theme>.png. The steps: Frontier with a row open,
// the Focus tree of S3, a drill into Y3 and then B3 (two levels), Back to
// Y3, the item modal open, a spec's tree, and All tasks.
//
//   node test/browser/graph-tree-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: graph-tree-shots.mjs <out dir>')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: await shotCss() })
const browser = await launch(chrome)

// Open the Graph from the nav, as a person does.
async function openGraph(page, harness, { width, height, theme }) {
  await page.open(harness.url({ page: 'app', graph: 'chains', theme }), { width, height, dark: theme === 'dark' })
  await page.until(`Boolean(document.querySelector('[data-shell]'))`)
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
  await page.until(`Boolean(document.querySelector('[data-nav-item="dashboard/graph"]'))`)
  await page.evaluate(`document.querySelector('[data-nav-item="dashboard/graph"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-frontier]'))`)
}
const settle = (page) => page.evaluate('new Promise((r) => setTimeout(r, 250))')

try {
  const page = await browser.page()
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
  ])
    for (const theme of ['light', 'dark']) {
      const shoot = async (name) => {
        await settle(page)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
      await openGraph(page, harness, { width, height, theme })
      await page.evaluate(`document.querySelector('[data-frontier-row="S3"] button').click()`)
      await shoot('1-frontier')
      await page.evaluate(`[...document.querySelectorAll('[data-frontier-row="S3"] button')].find((b) => b.textContent.startsWith('open tree')).click()`)
      await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'task:S3'`)
      await shoot('2-tree-S3')
      // Drill two levels: click Y3, then Enter on B3.
      await page.evaluate(`document.querySelector('[data-tree-node="Y3"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'task:Y3'`)
      await page.evaluate(`document.querySelector('[data-tree-node="B3"]').focus()`)
      await page.key('Enter', 'Enter', 13)
      await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'task:B3'`)
      await shoot('3-drill-B3')
      await page.evaluate(`document.querySelector('[data-graph-nav="back"]').click()`)
      await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'task:Y3'`)
      await shoot('4-back-Y3')
      await page.evaluate(`document.querySelector('[data-tree-node="Y3"]').focus()`)
      await page.key('o', 'KeyO', 79)
      // O opens the task's full details over the Graph.
      await page.until(`Boolean(document.querySelector('[data-task-modal] #avoozl-drawer-title'))`)
      await shoot('5-details-Y3')
      await page.key('Escape', 'Escape', 27)
      await page.until(`!document.querySelector('[data-task-modal]')`)
      await page.evaluate(
        `(() => { const i = document.querySelector('[data-graph-jump]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'billing'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit(); return true })()`,
      )
      await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'spec:billing'`)
      await shoot('6-spec-billing')
      await page.evaluate(`document.querySelector('[data-graph-tab="all"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-graph-view] svg'))`)
      await shoot('7-all-tasks')
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

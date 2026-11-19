#!/usr/bin/env node
// Screenshots of Dashboards › Graph with one draft spec (graph-chains.ts,
// &graph=drafts), in the full app with its left nav, at 1280 and 390 px,
// light and dark: <out>/<step>-<width>-<theme>.png. With --before, only the
// steps a build without draft tasks can show (Frontier, All tasks, the
// phone's menu).
//
//   node test/browser/graph-draft-shots.mjs <out dir> [--before]
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const args = process.argv.slice(2)
const before = args.includes('--before')
const [out] = args.filter((a) => !a.startsWith('--'))
if (!out) {
  console.error('Usage: graph-draft-shots.mjs <out dir> [--before]')
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
const settle = (page) => page.evaluate('new Promise((r) => setTimeout(r, 300))')

try {
  const page = await browser.page()
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
  ])
    for (const theme of ['light', 'dark']) {
      const phone = width < 768
      const shoot = async (name) => {
        await settle(page)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
      await page.open(harness.url({ page: 'app', graph: 'drafts', theme }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell]'))`)
      if (phone) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
      await page.until(`Boolean(document.querySelector('[data-nav-item="dashboard/graph"]'))`)
      await page.evaluate(`document.querySelector('[data-nav-item="dashboard/graph"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-frontier]'))`)
      await shoot('1-frontier')
      await page.evaluate(`document.querySelector('[data-graph-tab="all"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-graph-view] svg'))`)
      await shoot('2-all-tasks')
      if (!before) {
        await page.evaluate(`document.querySelector('[data-graph-tab="frontier"]').click()`)
        await page.until(`Boolean(document.querySelector('[data-frontier]'))`)
        await page.evaluate(
          `(() => { const i = document.querySelector('[data-graph-jump]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'M2'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit(); return true })()`,
        )
        await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'task:M2'`)
        await shoot('3-tree-M2')
        await page.evaluate(`document.querySelector('[data-tree-node="M2"]').focus()`)
        await page.key('o', 'KeyO', 79)
        await page.until(`Boolean(document.querySelector('[data-graph-item="task:M2"]'))`)
        await shoot('4-modal-M2')
        await page.key('Escape', 'Escape', 27)
        await page.until(`!document.querySelector('[data-graph-item]')`)
      }
      if (phone) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
        await page.until(`Boolean(document.querySelector('[data-nav-item="dashboard/graph"]'))`)
        await shoot(before ? '3-menu' : '5-menu')
        if (!before) {
          await page.until(`Boolean(document.querySelector('[data-rail-drafts]'))`)
          await page.evaluate(`document.querySelector('[data-rail-drafts]').click()`)
          await shoot('6-menu-drafts-off')
        }
      } else if (!before) {
        await page.until(`Boolean(document.querySelector('[data-rail-drafts]'))`)
        await page.evaluate(`document.querySelector('[data-graph-tab="all"]').click()`)
        await page.evaluate(`document.querySelector('[data-rail-drafts]').click()`)
        await page.until(`document.querySelector('[data-rail-drafts]').getAttribute('aria-pressed') === 'false'`)
        await shoot('5-drafts-off')
      }
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

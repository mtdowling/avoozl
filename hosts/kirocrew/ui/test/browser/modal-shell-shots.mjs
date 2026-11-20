#!/usr/bin/env node
// Full-app screenshots of the shared modal shell: the task modal (from Needs
// you), Review info, the Approve dialog, the Graph node modal, the instance
// name modal and the workspace Remove confirm, at 1280 and 390, light and
// dark: <out>/<modal>-<width>-<theme>.png
//
//   node test/browser/modal-shell-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: modal-shell-shots.mjs <out dir>')
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
const TOP = `[...document.querySelectorAll('dialog[data-modal]')].at(-1)`
const clickText = (selector, text) =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => (b.getAttribute('aria-label') || b.textContent).trim().startsWith(${JSON.stringify(text)})); b?.click(); return Boolean(b) })()`
try {
  const page = await browser.page()
  const settle = (ms = 500) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  const phone = (width) => width < 768
  const start = async (query, width, theme) => {
    await page.open(harness.url({ page: 'app', theme, ...query }), { width, height: phone(width) ? 844 : 900, dark: theme === 'dark' })
    await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
  }
  // Phone: the nav sits behind the bar; open it, press the item, and let it close.
  const goTo = async (width, label) => {
    if (phone(width)) {
      await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await settle()
      await page.evaluate(
        `[...document.querySelectorAll('[data-top-rail-list] [data-nav-head], [data-top-rail-list] [data-nav-item]')].find((t) => t.textContent.includes(${JSON.stringify(label)})).click()`,
      )
      await settle()
      if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    } else await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes(${JSON.stringify(label)})).click()`)
    await settle()
  }
  const shoot = async (name, width, theme) => {
    await settle(700)
    const file = path.join(out, `${name}-${width}-${theme}.png`)
    await page.screenshot(file)
    console.log(file)
  }
  const flows = {
    task: async (width, theme) => {
      await start({ needs: '1' }, width, theme)
      await page.until(clickText('button', 'Details for Item 1'), 30000)
      await page.until(`Boolean(${TOP}) && ${TOP}.querySelector('[data-modal-header] h2').textContent.includes('Review with team')`, 30000)
    },
    review: async (width, theme) => {
      await start({ reviewgroup: '1' }, width, theme)
      await page.until(clickText('button', 'Info: Meal planner'), 30000)
      await page.until(`Boolean(${TOP})`, 30000)
    },
    approve: async (width, theme) => {
      await start({ specs: '1', review: '1' }, width, theme)
      await goTo(width, 'Specs')
      await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
      await page.evaluate(`document.querySelector('[data-plan-row="spec:byte-types"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-spec-primary="approve"]'))`, 30000)
      await page.evaluate(`document.querySelector('[data-spec-primary="approve"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-approve-spec]'))`, 30000)
    },
    graph: async (width, theme) => {
      // A draft spec's task: a task card opens the full task details instead.
      await start({ graph: 'drafts' }, width, theme)
      if (phone(width)) await goTo(width, 'Graph')
      else await page.evaluate(`document.querySelector('[data-nav-item="dashboard/graph"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-frontier]'))`, 30000)
      await page.evaluate(`document.querySelector('[data-frontier-row="S3"] button').click()`)
      await page.evaluate(`[...document.querySelectorAll('[data-frontier-why] button')].find((b) => b.textContent.startsWith('open tree')).click()`)
      await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'task:S3'`, 30000)
      await page.evaluate(`document.querySelector('[data-tree-open="M2"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })) ?? true`)
      await page.until(`Boolean(${TOP})`, 30000)
    },
  }
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark'])
      for (const [name, flow] of Object.entries(flows)) {
        try {
          await flow(width, theme)
          await shoot(name, width, theme)
        } catch (error) {
          console.error(`${name} ${width} ${theme}: ${error.message}`)
          process.exitCode = 1
        }
      }
} finally {
  await browser.close()
  harness.remove()
}

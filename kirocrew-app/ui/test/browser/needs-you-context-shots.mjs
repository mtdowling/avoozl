#!/usr/bin/env node
// Full-app screenshots of Needs you > Decisions (harness ?page=app&needsctx=1):
// the list, then six items open (a question, a review group, a ready pull
// request, a draft review, a stop on failed checks, an item with no
// evidence), at 1280 and 390 px, light and dark: <out>/<shot>-<width>-<theme>.png
//
//   node test/browser/needs-you-context-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: needs-you-context-shots.mjs <out dir>')
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
const wait = (page, ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
// Item kinds, in the order the fixture lists them.
const PICKS = { decision: 'decision:', review: 'review:', ready: 'ready-to-merge:', draft: 'plan-review:', failed: 'stale-session:', bare: 'needs-human:' }
try {
  const page = await browser.page()
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', theme, needsctx: '1' }), { width, height: width < 768 ? 844 : 900, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
      await wait(page, 800)
      if (width < 768) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(page, 200)
        await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Needs you')).click()`)
        await wait(page, 200)
        await page.evaluate(`document.querySelector('[data-top-rail-list] [data-nav-item="waiting/decisions"]').click()`)
      } else {
        await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Needs you')).click()`)
        await wait(page, 300)
        await page.evaluate(`document.querySelector('[data-nav-item="waiting/decisions"]').click()`)
      }
      await page.until(`Boolean(document.querySelector('[data-conflict-list]'))`, 30000)
      await wait(page, 500)
      const shoot = async (name) => {
        await wait(page, 500)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
      await shoot('list')
      for (const [name, prefix] of Object.entries(PICKS)) {
        const ok = await page.evaluate(
          `(() => { const b = [...document.querySelectorAll('[data-conflict-pick]')].find((b) => b.dataset.conflictPick.startsWith(${JSON.stringify(prefix)})); b?.click(); return Boolean(b) })()`,
        )
        if (!ok) {
          console.error(`${name} ${width} ${theme}: no row`)
          process.exitCode = 1
          continue
        }
        await page.until(`Boolean(document.querySelector('[data-conflict-detail]'))`, 30000)
        await shoot(name)
        if (width < 768) {
          await page.evaluate(`document.querySelector('[data-list-detail-back]').click()`)
          await page.until(`Boolean(document.querySelector('[data-conflict-list]'))`, 30000)
        }
      }
    }
} finally {
  await browser.close()
  harness.remove()
}

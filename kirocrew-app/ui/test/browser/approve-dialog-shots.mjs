#!/usr/bin/env node
// Full-app screenshots of the Approve dialogs (task 57.6) on fake findings,
// desktop (1280) and phone (390), light and dark:
// <out>/<kind>-<width>-<theme>.png. `dialog` is the single Approve dialog as
// it opens; `changed` is the same dialog after a revision was written while
// it was open; `batch-changed` is Approve 2 specs with one spec updated.
// Pass `--only dialog` to take just the first kind (for a before shot).
//
//   node test/browser/approve-dialog-shots.mjs <out dir> [--only dialog]
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out, flag, only] = process.argv.slice(2)
if (!out) {
  console.error('Usage: approve-dialog-shots.mjs <out dir> [--only dialog]')
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
const kinds = ['dialog', 'changed', 'batch-changed'].filter((kind) => flag !== '--only' || kind === only)
try {
  const page = await browser.page()
  const settle = (ms = 300) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark'])
      for (const kind of kinds) {
        await page.open(harness.url({ page: 'app', specs: '1', review: '1', theme }), { width, height: width > 400 ? 900 : 844, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
        if (width < 768) {
          await page.evaluate(click('[data-top-rail-bar]'))
          await settle()
          await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
          await settle()
          if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)) await page.evaluate(click('[data-top-rail-bar]'))
        } else await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
        await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
        if (kind === 'batch-changed') {
          await page.evaluate(click('[data-spec-check="byte-types"]'))
          await page.evaluate(click('[data-spec-check="compression"]'))
          await page.until(`!document.querySelector('[data-approve-specs-open]').disabled`, 30000)
          await page.evaluate(click('[data-approve-specs-open]'))
          await page.until(`Boolean(document.querySelector('[data-approve-review="byte-types"] [data-open-review]'))`, 30000)
        } else {
          await page.evaluate(click('[data-plan-row="spec:byte-types"]'))
          await page.until(`Boolean(document.querySelector('[data-spec-primary="approve"]'))`, 30000)
          await page.evaluate(click('[data-spec-primary="approve"]'))
          await page.until(`Boolean(document.querySelector('[data-approve-spec]'))`, 30000)
        }
        if (kind !== 'dialog') {
          await page.evaluate('window.__moveRevision()')
          await page.until(`Boolean(document.querySelector('[data-revision-moved]'))`, 30000)
          // The batch dialog's update sits below its table; bring it into view.
          await page.evaluate(`document.querySelector('[data-revision-moved]').scrollIntoView({ block: 'center' })`)
        }
        await settle(600)
        const file = path.join(out, `${kind}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
} finally {
  await browser.close()
  harness.remove()
}

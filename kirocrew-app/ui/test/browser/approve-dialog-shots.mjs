#!/usr/bin/env node
// Full-app screenshots of the Approve dialogs (task 57.6) on fake findings,
// desktop (1280) and phone (390), light and dark:
// <out>/<kind>-<width>-<theme>.png. `dialog` is the single Approve dialog as
// it opens; `changed` is the same dialog after a revision was written while
// it was open; `batch-changed` is Approve 2 specs with one spec updated.
// Pass `--only dialog` to take just the first kind (for a before shot).
//
//   node test/browser/approve-dialog-shots.mjs <out dir> [--only dialog]
import path from 'node:path'
import { click, openSpecs, startShots } from './shots.mjs'

const { out, harness, browser } = await startShots('approve-dialog-shots.mjs <out dir> [--only dialog]')
const [, flag, only] = process.argv.slice(2)
const kinds = ['dialog', 'changed', 'batch-changed'].filter((kind) => flag !== '--only' || kind === only)
try {
  const page = await browser.page()
  const settle = (ms = 300) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark'])
      for (const kind of kinds) {
        await page.open(harness.url({ page: 'app', specs: '1', review: '1', theme }), { width, height: width > 400 ? 900 : 844, dark: theme === 'dark' })
        await openSpecs(page, width, settle, null)
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

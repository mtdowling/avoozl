#!/usr/bin/env node
// Full-app shots of a spec's review comments (tasks 57.4, 57.5), fake findings,
// 1280 and 390, light and dark: <out>/<name>-<width>-<theme>.png. "before" is
// the spec with Open review; "after" requirements with comments inline;
// "selected" one picked; "moved" Design's Moved or removed group; "hidden"
// the comments hidden; "overview" its Review card; "highlight" a block clicked.
//
//   node test/browser/review-view-shots.mjs <out dir>
import path from 'node:path'
import { click, openSpecs, startShots } from './shots.mjs'

const { out, harness, browser } = await startShots('review-view-shots.mjs <out dir>')
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 300))')
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      const size = { width, height: width > 400 ? 800 : 844, dark: theme === 'dark' }
      for (const [name, steps] of [
        ['before', []],
        ['after', [click('[data-open-review]')]],
        // One card selected: its lines highlighted.
        ['selected', [click('[data-open-review]'), 'wait', click('[data-finding-card="f-later"]')]],
        // Design: a moved finding lists first under Moved or removed.
        ['moved', [click('[data-open-review]'), 'wait', click('[data-spec-tab="design.md"]')]],
        // The comments hidden by the toggle (put back after the shot).
        ['hidden', [click('[data-open-review]'), 'wait', click('[data-comments-toggle]')]],
        // The Overview's Review card: rounds, chats and every comment.
        ['overview', [`document.querySelector('#avoozl-spec-review').scrollIntoView()`]],
        // A highlight clicked: its comment is picked.
        ['highlight', [click('[data-open-review]'), 'wait', click('[data-review-doc] [data-source-line="7"]')]],
      ]) {
        const url = harness.url({ page: 'app', basic: '1', specs: '1', review: '1', theme })
        const run = async (height) => {
          await page.open(url, { ...size, ...(height ? { height } : {}) })
          await openSpecs(page, width, settle)
          await page.until(`Boolean(document.querySelector('[data-open-review]'))`, 30000)
          for (const step of steps)
            if (step === 'wait') await page.until(`Boolean(document.querySelector('[data-finding-card]'))`, 30000)
            else await page.evaluate(step)
          if (!['before', 'hidden', 'overview'].includes(name)) await page.until(`Boolean(document.querySelector('[data-finding-card]'))`, 30000)
          await settle()
        }
        // Tall enough for the whole view: the app scrolls inside its own pane.
        await run(width > 400 ? 1700 : 3000)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        await page.evaluate(`localStorage.removeItem('avoozl:review-comments-hidden')`)
        console.log(file)
      }
    }
} finally {
  await browser.close()
  harness.remove()
}

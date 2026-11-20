#!/usr/bin/env node
// Full-app screenshots of direct links (spec direct-links) on fake data
// (harness ?page=app&direct=1), 1280 and 390, light and dark:
//   <out>/in-flight-<width>-<theme>.png   each attempt's action
//   <out>/needs-linked-<width>-<theme>.png a notice's decision, filters hiding it
//   <out>/needs-closed-<width>-<theme>.png an old link to a closed decision
//
//   node test/browser/direct-links-shots.mjs <out dir>
import path from 'node:path'
import { startShots } from './build.mjs'

const { out, harness, browser } = await startShots('direct-links-shots.mjs')
const settle = (page, ms = 600) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
try {
  const page = await browser.page()
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      const size = { width, height: width > 400 ? 900 : 844, dark: theme === 'dark' }
      await page.open(harness.url({ page: 'app', direct: '1', theme }), size)
      await page.until(`document.querySelectorAll('[data-in-flight-row]').length === 5`, 30000)
      await page.evaluate(`[...document.querySelectorAll('h2, h3, [data-section-title]')].find((h) => h.textContent.startsWith('In flight ('))?.scrollIntoView({ block: 'start' })`)
      await settle(page)
      let file = path.join(out, `in-flight-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file, await page.evaluate(`[...document.querySelectorAll('[data-in-flight-actions]')].map((a) => a.textContent.trim()).join(' | ')`))
      // The card scrolls; the last rows (log, worker machine, waiting) in a second shot.
      await page.evaluate(`[...document.querySelectorAll('[data-in-flight-row]')].at(-1).scrollIntoView({ block: 'end' })`)
      await settle(page, 300)
      file = path.join(out, `in-flight-${width}-${theme}-more.png`)
      await page.screenshot(file)
      console.log(file)

      await page.open(harness.url({ page: 'app', direct: '1', hide: '1', workspace: 'w', decision: 'LinkedDecision01', theme }), size)
      await page.until(`Boolean(document.querySelector('[data-decision-link="open"]'))`, 30000)
      await settle(page)
      file = path.join(out, `needs-linked-${width}-${theme}.png`)
      await page.screenshot(file)
      // A phone opens the linked item's detail; Back shows the list and the hint.
      console.log(
        file,
        await page.evaluate(
          `document.querySelector('[data-decision-link]').textContent + ' | ' + (document.querySelector('[data-linked-hidden]')?.textContent ?? 'detail open') + ' | ' + (document.querySelector('[data-conflict-detail], [data-list-detail-detail]')?.textContent?.slice(0, 60) ?? '')`,
        ),
      )

      await page.open(harness.url({ page: 'app', direct: '1', workspace: 'w', decision: 'OldDecision00001', theme }), size)
      await page.until(`Boolean(document.querySelector('[data-decision-link="closed"]'))`, 30000)
      await settle(page)
      file = path.join(out, `needs-closed-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file, await page.evaluate(`document.querySelector('[data-decision-link]').textContent`))
    }
} finally {
  await browser.close()
  harness.remove()
}

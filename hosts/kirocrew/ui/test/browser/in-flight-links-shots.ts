#!/usr/bin/env node
// @ts-nocheck: typing debt
// Full-app screenshots of Home's In flight with PR and branch chips (task
// 44.4) on fake data (harness ?page=app&links=1), desktop (1280) and phone
// (390), light and dark: <out>/in-flight-<width>-<theme>.png.
//
//   node test/browser/in-flight-links-shots.mjs <out dir>
import path from 'node:path'
import { startShots } from './shots.ts'

const { out, harness, browser } = await startShots('in-flight-links-shots.mjs <out dir>')
try {
  const page = await browser.page()
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', links: '1', theme }), { width, height: width > 400 ? 900 : 844, dark: theme === 'dark' })
      await page.until(`document.querySelectorAll('[data-in-flight-row]').length === 5`, 30000)
      // The In flight heading at the top, so its card shows whole.
      await page.evaluate(`[...document.querySelectorAll('h2, h3, [data-section-title]')].find((h) => h.textContent.startsWith('In flight ('))?.scrollIntoView({ block: 'start' })`)
      await page.evaluate('new Promise((r) => setTimeout(r, 600))')
      const file = path.join(out, `in-flight-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
      // The card scrolls; the last rows (fail, stale, no pull request) in a second shot.
      await page.evaluate(`[...document.querySelectorAll('[data-in-flight-row]')].at(-1).scrollIntoView({ block: 'end' })`)
      await page.evaluate('new Promise((r) => setTimeout(r, 300))')
      const more = path.join(out, `in-flight-${width}-${theme}-more.png`)
      await page.screenshot(more)
      console.log(more)
    }
} finally {
  await browser.close()
  harness.remove()
}

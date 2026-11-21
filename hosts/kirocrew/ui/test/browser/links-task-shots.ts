#!/usr/bin/env node
// Screenshots of a task's Links box (44.3) inside the full app (harness
// ?page=app), desktop 1280 and phone 390, light and dark:
//   1-task-links-<width>-<theme>.png   the Links box in task details
//   2-graph-links-<width>-<theme>.png  the same box after O on a Graph card
// It finds the box by its title, so it also runs on a tree from before 44.3.
//
//   node test/browser/links-task-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import { TASK_SHOT_HEIGHT, openFocusCard, openItemDetails, settledShot, startShots } from './shots.ts'

const { out, harness, browser } = await startShots('links-task-shots.mjs <out dir>')
const BOX = `[...document.querySelectorAll('[data-section-box]')].find((b) => b.querySelector('h3')?.textContent.trim() === 'Links')`
try {
  const page = await browser.page()
  const shoot = settledShot(page, out)
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      const dark = theme === 'dark'
      // Task details, opened from Home's Needs you row, scrolled to Links.
      await page.open(harness.url({ page: 'app', needs: '1', theme }), { width, height: TASK_SHOT_HEIGHT[width], dark })
      await openItemDetails(page)
      await page.until(`Boolean(${BOX}?.querySelector('[data-link-entry]'))`, 10000)
      await page.evaluate(`${BOX}.scrollIntoView({ block: 'start' })`)
      await shoot('1-task-links', width, theme)
      // The Graph: O on a Focus tree card opens the same task details.
      await openFocusCard(page, harness, width, theme)
      await page.until(`Boolean(${BOX}?.querySelector('[data-link-entry]'))`, 10000)
      await page.evaluate(`${BOX}.scrollIntoView({ block: 'start' })`)
      await shoot('2-graph-links', width, theme)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

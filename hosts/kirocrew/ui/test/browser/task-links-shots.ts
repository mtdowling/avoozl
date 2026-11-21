#!/usr/bin/env node
// Screenshots of a task's Links box and of the Graph's ↗, inside the full
// app (harness ?page=app), desktop 1280 and phone 390, light and dark:
//   1-links-<width>-<theme>.png      the Links box as the drawer opens
//   2-add-link-<width>-<theme>.png   after Add link: the fields for one link
//   3-graph-open-<width>-<theme>.png after O on a Focus tree card
// It finds the box by its title, so it also runs on a tree from before
// notes were removed (where the box is "Links and notes").
//
//   node test/browser/task-links-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import { TASK_SHOT_HEIGHT, openFocusCard, openItemDetails, settledShot, startShots } from './shots.ts'

const { out, harness, browser } = await startShots('task-links-shots.mjs <out dir>')
const BOX = `[...document.querySelectorAll('[data-section-box]')].find((b) => /^Links( and notes)?$/.test(b.querySelector('h3')?.textContent.trim() ?? ''))`
try {
  const page = await browser.page()
  const shoot = settledShot(page, out)
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      const dark = theme === 'dark'
      // The drawer, opened from Home's Needs you row, scrolled to Links.
      await page.open(harness.url({ page: 'app', needs: '1', theme }), { width, height: TASK_SHOT_HEIGHT[width], dark })
      await openItemDetails(page)
      await page.until(`Boolean(${BOX}?.querySelector('a, [data-note-entry], [data-link-entry]'))`, 10000)
      await page.evaluate(`${BOX}.scrollIntoView({ block: 'start' })`)
      await shoot('1-links', width, theme)
      const opened = await page.evaluate(`(() => { const b = ${BOX}.querySelector('[data-add-link]'); b?.click(); return Boolean(b) })()`)
      if (opened) {
        await page.until(`Boolean(${BOX}.querySelector('[data-add-link-form]'))`)
        await page.evaluate(`${BOX}.scrollIntoView({ block: 'start' })`)
        await shoot('2-add-link', width, theme)
      }
      // The Graph: O on a Focus tree card.
      await openFocusCard(page, harness, width, theme)
      await page.until(`Boolean(document.querySelector('[data-graph-item], [data-task-modal] #avoozl-drawer-title'))`)
      await shoot('3-graph-open', width, theme)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

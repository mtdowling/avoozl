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
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: task-links-shots.mjs <out dir>')
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
const SIZE = { 1280: 900, 390: 844 }
const BOX = `[...document.querySelectorAll('[data-section-box]')].find((b) => /^Links( and notes)?$/.test(b.querySelector('h3')?.textContent.trim() ?? ''))`
try {
  const page = await browser.page()
  const settle = (ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  const shoot = async (name, width, theme) => {
    await settle()
    const file = path.join(out, `${name}-${width}-${theme}.png`)
    await page.screenshot(file)
    console.log(file)
  }
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390]) {
      const dark = theme === 'dark'
      // The drawer, opened from Home's Needs you row, scrolled to Links.
      await page.open(harness.url({ page: 'app', needs: '1', theme }), { width, height: SIZE[width], dark })
      await page.until(
        `(() => { const b = [...document.querySelectorAll('button, a')].find((b) => b.getAttribute('aria-label') === 'Details for Item 1' || b.textContent.trim().startsWith('Details for Item 1')); b?.click(); return Boolean(b) })()`,
        10000,
      )
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
      await page.open(harness.url({ page: 'app', graph: 'chains', theme }), { width, height: SIZE[width], dark })
      await page.until(`Boolean(document.querySelector('[data-shell]'))`)
      if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
      await page.until(`Boolean(document.querySelector('[data-nav-item="dashboard/graph"]'))`)
      await page.evaluate(`document.querySelector('[data-nav-item="dashboard/graph"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-frontier]'))`)
      await page.evaluate(`document.querySelector('[data-frontier-row="S3"] button').click()`)
      await page.evaluate(`[...document.querySelectorAll('[data-frontier-row="S3"] button')].find((b) => b.textContent.startsWith('open tree')).click()`)
      await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'task:S3'`)
      await page.evaluate(`document.querySelector('[data-tree-node="Y3"]').focus()`)
      await page.key('o', 'KeyO', 79)
      await page.until(`Boolean(document.querySelector('[data-graph-item], [data-task-modal] #avoozl-drawer-title'))`)
      await shoot('3-graph-open', width, theme)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

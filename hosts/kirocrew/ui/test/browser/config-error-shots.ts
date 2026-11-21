#!/usr/bin/env node
// @ts-nocheck: typing debt
// Home with a valid workspace (before) and one whose .avoozl.json does not
// load (after), at 1280x800 and 390x844, light and dark.
//
//   node test/browser/config-error-shots.mjs <out dir>
import { saveShot, startShots } from './shots.ts'

const { out, harness, browser } = await startShots('node test/browser/config-error-shots.mjs <out dir>')
try {
  const page = await browser.page()
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ])
    for (const theme of ['light', 'dark'])
      for (const [name, extra] of [
        ['before', {}],
        ['after', { configError: '1' }],
      ]) {
        await page.open(harness.url({ page: 'app', theme, ...extra }), { width, height, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        await page.evaluate(`new Promise((r) => setTimeout(r, 1200))`)
        await saveShot(page, out, name, width, theme)
      }
} finally {
  await browser.close()
  harness.remove()
}

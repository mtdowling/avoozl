#!/usr/bin/env node
// Full-app screenshots of the Specs list: draft rows show a grey title with
// no Draft badge and the legend line sits on top; 1280 and 390 px, light and
// dark.
//   node test/browser/draft-title-shots.mjs <out dir>
import path from 'node:path'
import { openSpecs, startShots } from './shots.mjs'

const { out, harness, browser } = await startShots('draft-title-shots.mjs <out dir>')
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', basic: '1', specs: '1', theme }), { width, height: width > 400 ? 800 : 844, dark: theme === 'dark' })
      await openSpecs(page, width, settle, null)
      await page.until(`Boolean(document.querySelector('[data-spec-list] [data-plan-row]'))`, 30000)
      await settle()
      const file = path.join(out, `list-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
} finally {
  await browser.close()
  harness.remove()
}

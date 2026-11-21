#!/usr/bin/env node
// Full-app screenshots of Dashboards › Delivery with machine badges and the
// per-machine counts line (harness ?page=app&delivery=1&machines=1): 1280 and
// 390, light and dark: <out>/delivery-<width>-<theme>.png.
//
//   node test/browser/delivery-machine-shots.mjs <out dir>
import path from 'node:path'
import { startShots } from './shots.ts'

const { out, harness, browser } = await startShots('delivery-machine-shots.mjs <out dir>')
try {
  const page = await browser.page()
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', delivery: '1', machines: '1', theme }), { width, height: width > 400 ? 800 : 844, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
      if (width < 768) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
      }
      await page.evaluate(
        `(() => { const h = document.querySelector('${scope} [data-nav-head][data-nav-group="dashboard"]'); if (h && !h.hasAttribute('data-open')) h.click(); return true })()`,
      )
      await page.until(`Boolean(document.querySelector('${scope} [data-nav-group="delivery"]'))`)
      await page.evaluate(`document.querySelector('${scope} [data-nav-group="delivery"]').click()`)
      await page.until(`Boolean(document.querySelector('[data-machine-counts]'))`, 30000)
      // Bring the In progress lane into view.
      await page.evaluate(`(() => { document.querySelector('[data-machine-counts]')?.closest('section')?.scrollIntoView(); return true })()`)
      await page.evaluate('new Promise((r) => setTimeout(r, 600))')
      const file = path.join(out, `delivery-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(
        file,
        await page.evaluate(
          `document.querySelector('[data-machine-counts]').textContent + ' | badges: ' + [...document.querySelectorAll('[data-machine-badge]')].map((b) => b.textContent).join(', ')`,
        ),
      )
    }
} finally {
  await browser.close()
  harness.remove()
}

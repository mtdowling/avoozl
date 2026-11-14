// node shelf-shots.mjs <out dir>: Settings > Repository setup with its shelf open, 390 and 1280 px, light and dark.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const out = process.argv[2]
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness()
const browser = await launch(findChrome())
try {
  const page = await browser.page()
  for (const width of [390, 1280])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', radar: '1', theme }), { width, height: 800, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[role="tab"]'))`)
      await page.evaluate(`[...document.querySelectorAll('button[role="tab"]')].find((b) => b.textContent.trim() === 'Settings').click()`)
      await page.until(`Boolean(document.querySelector('[data-settings-section="repositories"] button[aria-expanded]'))`)
      await page.evaluate(`document.querySelector('[data-settings-section="repositories"] button[aria-expanded]').click()`)
      await page.evaluate('new Promise((r) => setTimeout(r, 200))')
      await page.screenshot(path.join(out, `settings-closed-${width}-${theme}.png`))
      const opener = await page.evaluate(`Boolean(document.querySelector('[data-open-shelf="repositories"]'))`)
      if (opener) {
        await page.evaluate(`document.querySelector('[data-open-shelf="repositories"]').click()`)
        await page.evaluate('new Promise((r) => setTimeout(r, 300))')
      }
      await page.screenshot(path.join(out, `settings-shelf-${width}-${theme}.png`))
    }
} finally {
  await browser.close()
  harness.remove()
}

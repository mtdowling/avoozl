// node panel-button-shots.mjs <out dir>: the side panel's Open Avoozl button, 390 and 1280 px, light and dark.
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
      await page.open(harness.url({ page: 'panel', theme, sid: 'chat-1' }), { width, height: 800, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-open-avoozl]'))`)
      await page.evaluate(`document.querySelector('[data-open-avoozl]').scrollIntoView({ block: 'center' })`)
      await page.evaluate('new Promise((r) => setTimeout(r, 200))')
      await page.screenshot(path.join(out, `panel-open-avoozl-${width}-${theme}.png`))
    }
} finally {
  await browser.close()
  harness.remove()
}

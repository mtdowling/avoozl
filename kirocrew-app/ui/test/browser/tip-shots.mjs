// node tip-shots.mjs <out dir>: the touch tooltip open at 390 and 1280 px, light and dark.
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
      await page.open(harness.url({ page: 'tip', theme }), { width, height: 400, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-plain]'))`)
      const { x, y } = await page.evaluate(`(() => { const r = document.querySelector('[data-plain]').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 5 } })()`)
      await page.tap(x, y)
      await page.evaluate('new Promise((r) => setTimeout(r, 200))')
      await page.screenshot(path.join(out, `tooltip-tap-${width}-${theme}.png`))
    }
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of the Forward screen on replies the real operations gave in the
// live scratch run: <out>/forward-<state>-<width>.png for ok, blocked and stopped.
//
//   node test/browser/forward-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import path from 'node:path'
import { startShots } from './shots.ts'

const SIZES = [
  [390, 800],
  [1100, 800],
]
const { out, harness, browser } = await startShots('forward-shots.mjs <out dir>')
try {
  const page = await browser.page()
  for (const state of ['ok', 'blocked', 'stopped'])
    for (const [width, height] of SIZES) {
      await page.open(harness.url({ page: 'forward', state }), {
        width,
        height,
        dark: false,
      })
      await page.until(`Boolean(document.querySelector('[data-forward-screen]'))`)
      await page.evaluate('new Promise((r) => setTimeout(r, 300))')
      const file = path.join(out, `forward-${state}-${width}.png`)
      await page.screenshot(file)
      console.log(file)
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

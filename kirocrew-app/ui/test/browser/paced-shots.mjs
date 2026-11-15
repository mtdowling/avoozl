#!/usr/bin/env node
// Screenshots for the paced-writes screens light and dark: the projection confirm step (320 and 1280 px) and
// Settings > Where tasks live (1280 px)
// (the two write-limit fields and the progress line).
//
//   node test/browser/paced-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: paced-shots.mjs <out dir>')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS })
const browser = await launch(chrome)
const click = (text) =>
  `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  for (const theme of ['light', 'dark'])
    for (const width of [320, 1280]) {
      const size = { width, height: 900, dark: theme === 'dark' }
      // The confirm step of the projection modal.
      await page.open(harness.url({ page: 'projection', theme }), size)
      await page.until(`Boolean(document.querySelector('[data-modal] button'))`)
      await settle()
      await page.evaluate(click('Create issues (held)'))
      await page.until(`Boolean(document.querySelector('[data-confirm]'))`)
      await settle()
      let file = path.join(out, `projection-confirm-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
      // Settings > Where tasks live (the app shell is shot at 1280 only).
      if (width !== 1280) continue
      await page.open(harness.url({ page: 'app', radar: '1', theme }), { ...size, height: 900 })
      await page.until(`Boolean(document.querySelector('[data-top-row]'))`)
      await settle()
      await page.evaluate(click('Settings'))
      await settle()
      await page.evaluate(click('Where tasks live'))
      await settle()
      await page.evaluate(click('Configure where tasks live'))
      await page.until(`Boolean(document.querySelector('#avoozl-settings-writes-hour'))`)
      await settle()
      await page.evaluate(`(() => { document.querySelector('#avoozl-settings-writes-hour').scrollIntoView({ block: 'center' }); return true })()`)
      await settle()
      file = path.join(out, `settings-writes-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
} finally {
  await browser.close()
  harness.remove()
}

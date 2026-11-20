#!/usr/bin/env node
// Screenshots of plugin checks on the page (plugin-checks pk-3.1), desktop
// 1280 and phone 390, light and dark, from fixture records only:
//   plugin-checks-<width>-<theme>.png
//
//   node test/browser/plugin-checks-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: plugin-checks-shots.mjs <out dir>')
  process.exit(2)
}
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: await shotCss(), entry: fileURLToPath(new URL('./plugin-checks.tsx', import.meta.url)) })
const browser = await launch(findChrome())
try {
  const page = await browser.page()
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ theme }), { width, height: 900, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-stage-checks]'))`)
      const file = path.join(out, `plugin-checks-${width}-${theme}.png`)
      await page.screenshot(file, { selector: '[data-pk-shot]' })
      console.log(file)
      if (await page.evaluate('document.documentElement.scrollWidth > innerWidth')) throw Error(`Horizontal overflow at ${width} ${theme}`)
      if (page.errors.length) throw Error(page.errors.join('\n'))
    }
} finally {
  await browser.close()
  harness.remove()
}

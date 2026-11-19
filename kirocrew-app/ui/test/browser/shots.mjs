// What the screenshot scripts share: the start (the out folder from the
// command line, Chrome, and the harness on Kiro Crew's stylesheet, from
// shotCss()), and the full app's Specs page opened on a
// desktop or a phone.
import fs from 'node:fs'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

// `usage` is the command line the script takes, for the message without one.
export async function startShots(usage) {
  const [out] = process.argv.slice(2)
  if (!out) {
    console.error(`Usage: ${usage}`)
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
  return { out, harness, browser }
}

export const click = (selector) => `document.querySelector(${JSON.stringify(selector)}).click()`

// Specs from the top row; a phone picks it in the top rail's menu, then
// closes the menu. Ends with `spec` open, or only the list when it is null.
export async function openSpecs(page, width, settle, spec = 'byte-types') {
  await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
  if (width < 768) {
    await page.evaluate(click('[data-top-rail-bar]'))
    await settle()
    await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
    await settle()
    if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)) await page.evaluate(click('[data-top-rail-bar]'))
  } else await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
  if (!spec) return
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:${spec}"]'))`, 30000)
  await page.evaluate(click(`[data-plan-row="spec:${spec}"]`))
}

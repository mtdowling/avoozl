#!/usr/bin/env node
// Screenshots of the spec details panel's Links box (task 44.2) in the full
// app on demo data, desktop 1280 and phone 390, light and dark:
//   links-<width>-<theme>.png   Meal planner with a fixture link set
//   none-<width>-<theme>.png    the same spec with no stored records
// The panel scrolls to the Links box, or to Repositories on a tree without
// one, so before and after show the same place.
//
//   AVOOZL_HOST_CSS=<host css> node test/browser/spec-links-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'
import { demoReplies, demoScript } from './demo-replies.mjs'
import { noLinksFixture, specLinksFixture } from './spec-links-fixture.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: spec-links-shots.mjs <out dir>')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
fs.mkdirSync(out, { recursive: true })
const browser = await launch(chrome)
const harnesses = []
try {
  const page = await browser.page()
  const wait = (ms = 300) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
  const button = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
  for (const [name, links] of [
    ['links', specLinksFixture()],
    ['none', noLinksFixture()],
  ]) {
    const harness = await buildHarness({
      hostCss: process.env.AVOOZL_HOST_CSS,
      scripts: { 'demo.js': demoScript(await demoReplies({ plan: { id: 'meal-planner', with: { links } } })) },
    })
    harnesses.push(harness)
    for (const width of [1280, 390])
      for (const theme of ['light', 'dark']) {
        const dark = theme === 'dark'
        const url = harness.url({ page: 'demo', theme })
        await page.open(url, { width, height: 900, dark })
        await page.evaluate('localStorage.clear()')
        await page.open(url, { width, height: 900, dark })
        await page.until(`Boolean(${button('Start demo')})`)
        await click(button('Start demo'))
        await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
        if (width < 768) {
          await click(`document.querySelector('[data-top-rail-bar]')`)
          await wait(150)
        }
        await click(`document.querySelector('[data-nav-group="plans"]')`)
        if (width < 768) await click(`document.querySelector('[data-top-rail-bar]')`)
        await page.until(`Boolean(document.querySelector('[data-plans-list]'))`)
        await click(button('Meal planner', `document.querySelector('[data-plans-list]')`))
        await page.until(`Boolean(document.querySelector('[data-spec-rail] [data-state-count]'))`)
        await wait(800)
        await page.evaluate(
          `(() => { const el = document.querySelector('[aria-label="Spec details"] [data-spec-links]') || document.querySelector('[aria-label="Spec details"] [data-rail-section="Repositories"]'); el.scrollIntoView({ block: ${width < 768 ? "'center'" : "'start'"} }) })()`,
        )
        await wait(300)
        await page.screenshot(path.join(out, `${name}-${width}-${theme}.png`))
      }
  }
} finally {
  await browser.close()
  for (const harness of harnesses) harness.remove()
}

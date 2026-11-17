#!/usr/bin/env node
// Screenshots of the Flow page (a task at 80% of its budget) and Settings ›
// Flow in the app shell (harness ?page=app&flow=1), at 390 and 1280 px,
// light and dark: <out>/<flow|settings>-<width>-<theme>.png.
//
//   node test/browser/flow-rules-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: flow-rules-shots.mjs <out dir>')
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
const wait = (page, ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
const click = (selector, text) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
try {
  const page = await browser.page()
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ])
    for (const theme of ['light', 'dark']) {
      const menu = async () => {
        if (width >= 768) return
        if (!(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(page, 200)
      }
      const go = async (head, item) => {
        await menu()
        if (!(await page.evaluate(click(`${scope(width)} [data-nav-head]`, head)))) throw Error(`No nav head ${head}`)
        await wait(page, 300)
        if (item) {
          await menu()
          await page.evaluate(click(`${scope(width)} [data-nav-item]`, item))
        }
        if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(page, 800)
      }
      const shot = async (name) => {
        await wait(page)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
      await page.open(harness.url({ page: 'app', radar: '1', flow: '1', theme }), { width, height, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      await wait(page, 1200)
      await go('Flow', 'Overview')
      await page.evaluate(`document.querySelector('[data-flow-bar]')?.scrollIntoView({ block: 'center' })`)
      await shot('flow')
      await go('Settings', 'Flow')
      await page.evaluate(click('button', 'Configure flow'))
      await wait(page, 800)
      await page.evaluate(`document.querySelector('[data-section="Pause on a broken check"], [data-section="Stop the line"]')?.scrollIntoView({ block: 'start' })`)
      await shot('settings')
      // The CI and Retro field grids, in the middle.
      await page.evaluate(`document.querySelector('[data-flow-group="ci"], [data-ci-settings]')?.scrollIntoView({ block: 'start' })`)
      await shot('settings-fields')
      // The end of the dialog: the last group and the Save footer.
      await page.evaluate(`(() => { const body = [...document.querySelectorAll('[data-modal-body]')].at(-1); if (body) body.scrollTop = body.scrollHeight; return true })()`)
      await shot('settings-end')
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of Settings > Plugins in the full app shell on fake data
// (harness ?page=app&plugins=many|none): eight plugins, none, and none on a
// short window so the Add plugin card has more than fits. 1280 and 390 px,
// light and dark: <out>/<case>-<width>-<theme>.png. Prints each card pair's
// heights and which side scrolls.
//
//   AVOOZL_HOST_CSS=<host css> node test/browser/plugins-cards-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: plugins-cards-shots.mjs <out dir>')
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
// Each child of the layout: its height and whether its content overflows.
const MEASURE = `JSON.stringify([...(document.querySelector('[data-plugins-layout]')?.children ?? [])].map((c) => { const s = c.querySelector('[data-paired-body]') ?? c; return { h: Math.round(c.getBoundingClientRect().height), scrolls: s.scrollHeight > s.clientHeight + 1 } }))`
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
  const menu = (width) =>
    width >= 768 ? 'true' : `(() => { if (!document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`
  const head = (width) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`
  const item = (width) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-item]')].filter((x) => x.textContent.trim() === 'Plugins').at(-1); if (b) b.click(); return Boolean(b) })()`
  const cases = [
    ['many', 'many', 900],
    ['none', 'none', 900],
    ['short', 'none', 420],
  ]
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, plugins, height] of cases) {
        if (width < 768 && name === 'short') continue
        await page.open(harness.url({ page: 'app', theme, roles: 'single', plugins }), { width, height, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of [menu(width), head(width), item(width)]) {
          await settle()
          await page.evaluate(step)
        }
        await page.until(`Boolean(document.querySelector('[data-plugins-layout]'))`)
        await settle()
        await page.evaluate(`document.querySelector('[data-plugins-layout]').scrollIntoView({ block: 'start' })`)
        await settle()
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file, await page.evaluate(MEASURE))
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of epic context (epic-context ec-2.7), desktop 1280 and phone
// 390, light and dark, from fixture records only: Settings › Epic context,
// Settings › Plugins with a context part, and the Graph with a task's chip.
//   <label>-<view>-<width>-<theme>.png
// `context-empty` is Settings › Epic context on a machine with no context of
// its own.
//
//   node test/browser/epic-context-shots.mjs <out dir> [label]
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out, label = 'after'] = process.argv.slice(2)
if (!out) {
  console.error('Usage: epic-context-shots.mjs <out dir> [label]')
  process.exit(2)
}
fs.mkdirSync(out, { recursive: true })
// [view, nav head or null, nav item, what shows once the page is up, extra query]
const VIEWS = [
  ['context', 'Settings', 'Epic context', '[data-epic-context-settings]', {}],
  ['context-empty', 'Settings', 'Epic context', '[data-epic-context-settings]', { epicmachine: 'none' }],
  ['plugins', 'Settings', 'Plugins', '[data-plugin-context]', {}],
  ['graph', 'Dashboards', 'Graph', '[data-epic-context]', {}],
]
const harness = await buildHarness({ hostCss: await shotCss() })
const browser = await launch(findChrome())
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
  const menu = (width) =>
    width >= 768 ? 'true' : `(() => { if (!document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`
  const head = (width, text) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`
  const item = (width, text) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-item]')].filter((x) => x.textContent.trim() === ${JSON.stringify(text)}).at(-1); if (b) b.click(); return Boolean(b) })()`
  for (const [view, group, name, shows, extra] of VIEWS)
    for (const theme of ['light', 'dark'])
      for (const [size, width] of [
        ['desktop', 1280],
        ['phone', 390],
      ]) {
        const open = async (height) => {
          await page.open(harness.url({ page: 'app', theme, roles: 'single', ghfull: '1', epiccontext: '1', ...extra }), { width, height, dark: theme === 'dark' })
          await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
          for (const step of [menu(width), head(width, group), item(width, name)]) {
            await settle()
            await page.evaluate(step)
          }
          await settle()
          await page.until(`Boolean(document.querySelector(${JSON.stringify(shows)}))`)
        }
        await open(900)
        const height = await page.evaluate(
          "(() => { const s = [...document.querySelectorAll('*')].reduce((a, e) => (e.scrollHeight - e.clientHeight > a.scrollHeight - a.clientHeight ? e : a), document.documentElement); return document.documentElement.clientHeight + s.scrollHeight - s.clientHeight })()",
        )
        await open(Math.min(Math.max(height, 700), 3600))
        const file = path.join(out, `${label}-${view}-${size}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
        if (page.errors.length) throw Error(page.errors.join('\n'))
      }
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of Settings › Models in the full app
// shell on fake data (harness ?page=app&roles=...): desktop (1280 px) and
// phone (390 px), light and dark: <out>/<name>-<width>-<theme>.png.
//
//   node test/browser/models-ux-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: models-ux-shots.mjs <out dir>')
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
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
  const menu = (width) =>
    width >= 768 ? 'true' : `(() => { if (!document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`
  const head = (width) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`
  const item = (width, text) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-item]')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (b) b.click(); return Boolean(b) })()`
  const press = (text) =>
    `(() => { const b = [...document.querySelectorAll('button, summary')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  const shots = [['models', 'plans', 'Models', false]]
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, roles, tab, help] of shots) {
        const size = { width, height: 900, dark: theme === 'dark' }
        const url = harness.url({ page: 'app', radar: '1', theme, roles })
        const steps = [
          menu(width),
          head(width),
          item(width, tab),
          ...(tab === 'Repository setup' ? [press('Configure repository setup')] : []),
          ...(help ? [press('What the roles make')] : []),
          ...(name === 'github-calls'
            ? [`(() => { const t = document.querySelector('[data-github-usage]'); if (t) t.scrollIntoView({ block: 'center' }); return Boolean(t) })()`]
            : []),
        ]
        await page.open(url, size)
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of steps) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        const height = Math.min(4000, Math.ceil(await page.evaluate('document.documentElement.scrollHeight')))
        await page.open(url, { ...size, height })
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of steps) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

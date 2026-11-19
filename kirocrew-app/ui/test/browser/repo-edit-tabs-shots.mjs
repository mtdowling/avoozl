#!/usr/bin/env node
// Screenshots of a repository's Edit dialog (Settings > Repository setup),
// one per tab, in the full app shell on fake data (harness
// ?page=app&roles=plans). `mirror-role` is the Mirror tab after Set up
// mirror. 1280 and 390 px, light and dark: <out>/<name>-<width>-<theme>.png.
// With names after <out>, only those shots. `before` takes the dialog as it
// opens, for a tree without tabs.
//
//   node test/browser/repo-edit-tabs-shots.mjs <out dir> [name...]
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out, ...only] = process.argv.slice(2)
if (!out) {
  console.error('Usage: repo-edit-tabs-shots.mjs <out dir> [name...]')
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
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
  const menu = (width) =>
    width >= 768 ? 'true' : `(() => { if (!document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`
  const head = (width) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`
  const item = (width) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-item]')].find((x) => x.textContent.trim() === 'Repository setup'); if (b) b.click(); return Boolean(b) })()`
  const click = (selector, text) =>
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => !x.disabled && (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  const tab = (key) => `(() => { document.querySelector('[data-repository-edit] [role=tab][data-tab="${key}"]')?.click(); return true })()`
  const shots = [
    ['before', []],
    ['general', [tab('general')]],
    ['landing', [tab('landing')]],
    ['github', [tab('github')]],
    ['mirror', [tab('mirror')]],
    ['mirror-role', [tab('mirror'), click('[data-repository-edit] [role=tabpanel] button', 'Set up mirror')]],
    ['map', [tab('map')]],
    // The Isolation panel under Landing, scrolled into view.
    ['isolation', [tab('landing')]],
  ].filter(([name]) => (only.length ? only.includes(name) : name !== 'before'))
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, extra] of shots) {
        const size = { width, height: 900, dark: theme === 'dark' }
        await page.open(harness.url({ page: 'app', basic: '1', theme, roles: 'plans' }), size)
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of [menu(width), head(width), item(width), click('[data-repository-list] button', 'Edit recipe-box'), ...extra]) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        await page.evaluate(
          name === 'isolation'
            ? `document.querySelector('[data-isolation]')?.scrollIntoView({ block: 'center' })`
            : `document.querySelectorAll('[data-modal-body]').forEach((x) => x.scrollTo(0, 0))`,
        )
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

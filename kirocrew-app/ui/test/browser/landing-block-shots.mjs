#!/usr/bin/env node
// Screenshots for the one landing block (design §4.25), in the full app shell
// on fake data: a repository's Edit › Landing tab scrolled to its Who merges
// and Conflicts sections, and Settings › Delivery.
// 1280 and 390 px, light and dark: <out>/<name>-<width>-<theme>.png. Keep
// the files outside git.
//
//   node test/browser/landing-block-shots.mjs <out dir> [name...]
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out, ...only] = process.argv.slice(2)
if (!out) {
  console.error('Usage: landing-block-shots.mjs <out dir> [name...]')
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
  const item = (width, name) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-item]')].filter((x) => x.textContent.trim() === ${JSON.stringify(name)}).pop(); if (b) b.click(); return Boolean(b) })()`
  const click = (selector, text) =>
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => !x.disabled && (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  const tab = (key) => `(() => { document.querySelector('[data-repository-edit] [role=tab][data-tab="${key}"]')?.click(); return true })()`
  // Scroll the dialog body so the heading named `title` is at its top.
  const scrollTo = (title) =>
    `(() => { const h = [...document.querySelectorAll('[data-modal-body] h2, [data-modal-body] h3, [data-modal-body] h4')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(title)})); const body = document.querySelector('[data-modal-body]'); if (h && body) body.scrollTo(0, h.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8); return Boolean(h) })()`
  const shots = [
    ['landing-top', 'Repository setup', [click('[data-repository-list] button', 'Edit recipe-box'), tab('landing')]],
    ['landing-merges', 'Repository setup', [click('[data-repository-list] button', 'Edit recipe-box'), tab('landing'), scrollTo('Who merges')]],
    ['delivery', 'Delivery', []],
  ].filter(([name]) => !only.length || only.includes(name))
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, nav, extra] of shots) {
        const size = { width, height: 900, dark: theme === 'dark' }
        await page.open(harness.url({ page: 'app', basic: '1', theme, roles: 'plans' }), size)
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of [menu(width), head(width), item(width, nav), ...extra]) {
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

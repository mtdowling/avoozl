#!/usr/bin/env node
// Screenshots of Settings > Repository setup in the full app shell on fake
// data (harness ?page=app&roles=plans): the list with its setup action, the
// offer right after Add repository, the set-up dialog (no folder step) and
// the View modal with its one Close. 1280 and 390 px, light and dark:
// <out>/<name>-<width>-<theme>.png.
//
//   node test/browser/add-repository-setup-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: add-repository-setup-shots.mjs <out dir>')
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
  const item = (width, text) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-item]')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (b) b.click(); return Boolean(b) })()`
  const click = (selector, text) =>
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  const type = `(() => { const i = document.getElementById('avoozl-repo-folder'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '/src/new-service'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
  const added = [type, click('[data-add-repository] button', 'Check folder'), click('[data-step="confirm"] button', 'Add repository')]
  const shots = [
    ['list', []],
    ['view', [click('[data-repository-list] button', 'View ')]],
    ['added', added],
    ['setup', [...added, `document.querySelector('[data-setup-offer] button').click()`]],
  ]
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, extra] of shots) {
        const size = { width, height: 900, dark: theme === 'dark' }
        await page.open(harness.url({ page: 'app', radar: '1', theme, roles: 'plans' }), size)
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of [menu(width), head(width), item(width, 'Repository setup'), ...extra]) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        if (name === 'added') await page.evaluate(`document.querySelector('[data-setup-offer]')?.scrollIntoView({ block: 'center' })`)
        await page.evaluate(`document.querySelectorAll('dialog [data-modal-body]').forEach((x) => x.scrollTo(0, 0))`)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

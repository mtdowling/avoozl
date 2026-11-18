#!/usr/bin/env node
// Screenshots of the Settings pages that pair two cards (PairedCards), in the
// full app shell on fake data, 1280 and 390 px, light and dark:
// <out>/<case>-<width>-<theme>.png. Plugins (?plugins=many|none): eight
// plugins, none, and none on a short window so Add plugin has more than
// fits. Content rules (?rules=many|one): fourteen rule sets, and one set
// picked so its details are the longer side. Prints each pair's heights and
// which side scrolls. `only` names the cases to take.
//
//   AVOOZL_HOST_CSS=<host css> node test/browser/paired-cards-shots.mjs <out dir> [cases...]
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out, ...only] = process.argv.slice(2)
if (!out) {
  console.error('Usage: paired-cards-shots.mjs <out dir> [cases...]')
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
// Each card of the pair: its height and whether its body overflows.
const measure = (layout) =>
  `JSON.stringify([...(document.querySelector('${layout}')?.children ?? [])].map((c) => { const s = c.querySelector('[data-paired-body]') ?? c; return { h: Math.round(c.getBoundingClientRect().height), scrolls: s.scrollHeight > s.clientHeight + 1 } }))`
const PLUGINS = ['Plugins', '[data-plugins-layout]']
const RULES = ['Content rules', '[data-content-layout]']
// Opens a rule set so the details side shows its fields.
const PICK = `(() => { const b = [...document.querySelectorAll('[data-rule-panel] button')].find((x) => x.textContent.includes('codenames')); if (b) b.click(); return true })()`
const CASES = [
  ['plugins-many', PLUGINS, { plugins: 'many' }, 900],
  ['plugins-none', PLUGINS, { plugins: 'none' }, 900],
  ['plugins-short', PLUGINS, { plugins: 'none' }, 420, { desktop: true }],
  ['content-many', RULES, { rules: 'many' }, 900],
  ['content-details', RULES, { rules: 'one' }, 700, { pick: true }],
]
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
  const menu = (width) =>
    width >= 768 ? 'true' : `(() => { if (!document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`
  const head = (width) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`
  const item = (width, label) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-item]')].filter((x) => x.textContent.trim() === ${JSON.stringify(label)}).at(-1); if (b) b.click(); return Boolean(b) })()`
  const cases = only.length ? CASES.filter(([name]) => only.includes(name)) : CASES
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, [label, layout], query, height, opts = {}] of cases) {
        if (width < 768 && opts.desktop) continue
        await page.open(harness.url({ page: 'app', theme, roles: 'single', ...query }), { width, height, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of [menu(width), head(width), item(width, label)]) {
          await settle()
          await page.evaluate(step)
        }
        await page.until(`Boolean(document.querySelector('${layout} > *'))`)
        await settle()
        if (opts.pick) {
          await page.evaluate(PICK)
          await settle()
        }
        await page.evaluate(`document.querySelector('${layout}').scrollIntoView({ block: 'start' })`)
        await settle()
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file, await page.evaluate(measure(layout)))
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

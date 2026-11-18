#!/usr/bin/env node
// Screenshots of the Settings pages that edit in place, inside the full app
// shell (?page=app&inline=1), at 1280 and 390 px, light and dark. Each shot
// has one field edited, so the Save and Discard footer shows.
//
//   node test/browser/settings-inline-shots.mjs <out dir> [page ...]
//
// AVOOZL_CHROME works as in screenshots.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out, ...asked] = process.argv.slice(2)
if (!out) {
  console.error('Usage: settings-inline-shots.mjs <out dir> [page ...]')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
const set = (selector, value) =>
  `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
const PAGES = {
  delivery: { label: 'Delivery', ready: 'avoozl-delivery-investigate', edit: set('#avoozl-delivery-rounds', '4') },
  models: { label: 'Models', ready: null, wait: "Boolean(document.querySelector('[data-models-settings]'))", edit: null },
  content: { label: 'Content rules', ready: null, wait: `Boolean(document.querySelector('[data-rule-details]'))`, edit: `(() => { const l = [...document.querySelectorAll('[data-rule-details] label')].find((x) => x.textContent.includes('Incoming items')); l.querySelector('input').click(); return true })()` },
  plugins: { label: 'Plugins', ready: null, wait: `Boolean(document.querySelector('[data-plugins-layout] button'))`, edit: null },
  repositories: { label: 'Repository setup', ready: 'avoozl-settings-repo-0-base', edit: set('#avoozl-settings-repo-0-base', 'develop') },
  flow: { label: 'Flow', ready: 'avoozl-flow-every', edit: set('#avoozl-flow-every', '12') },
}
const names = asked.length ? asked : Object.keys(PAGES)
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS })
const browser = await launch(chrome)
const click = (selector, text) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
try {
  const page = await browser.page()
  const wait = (ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  for (const name of names) {
    const spec = PAGES[name]
    for (const width of [1280, 390])
      for (const theme of ['light', 'dark']) {
        await page.open(harness.url({ page: 'app', radar: '1', inline: '1', theme }), { width, height: width > 700 ? 900 : 844, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
        if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(200)
        await page.evaluate(click(`${scope} [data-nav-head]`, 'Settings'))
        await wait(200)
        if (width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await page.evaluate(click(`${scope} [data-nav-item]`, spec.label))
        if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await wait(300)
        await page.until(spec.ready ? `Boolean(document.getElementById(${JSON.stringify(spec.ready)}))` : spec.wait)
        if (spec.edit) {
          await page.evaluate(spec.edit)
          await page.until(`Boolean(document.querySelector('[data-save-footer]'))`)
        }
        await wait(250)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  }
} finally {
  await browser.close()
  harness.remove()
}

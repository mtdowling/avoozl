// Settings > Plugins pairs the Add plugin card with the Installed plugins
// card through the shared PairedCards part: side by side the two share one
// height and the one with more content scrolls inside itself; stacked on a
// phone each takes its natural height. The browser tests are skipped when no
// Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('both Plugins cards are PairedCards in one PairedCards row', () => {
  assert.match(source('PluginsSettings.tsx'), /<PairedCards paired=\{wide\}[\s\S]*<AddPlugin [\s\S]*<PairedCard title="Installed plugins"[\s\S]*<\/PairedCards>/)
  assert.match(source('AddPlugin.tsx'), /<PairedCard title="Add plugin"/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the paired cards tests'
let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness()
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})
const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 300))')

async function open(plugins, width, height) {
  await page.open(harness.url({ page: 'app', roles: 'single', plugins }), { width, height })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
  const steps = [
    width >= 768 ? 'true' : `(() => { if (!document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`,
    `(() => { const b = [...document.querySelectorAll('${scope} [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return true })()`,
    `(() => { const b = [...document.querySelectorAll('${scope} [data-nav-item]')].filter((x) => x.textContent.trim() === 'Plugins').at(-1); if (b) b.click(); return Boolean(b) })()`,
  ]
  for (const step of steps) {
    await settle()
    await page.evaluate(step)
  }
  await page.until(`Boolean(document.querySelector('[data-plugins-layout] [data-paired-body]'))`)
  await settle()
  return JSON.parse(
    await page.evaluate(
      `JSON.stringify([...document.querySelector('[data-plugins-layout]').children].map((c) => { const b = c.querySelector('[data-paired-body]'); return { name: b.getAttribute('aria-label'), height: c.getBoundingClientRect().height, natural: b.scrollHeight, shown: b.clientHeight, scrolls: b.scrollHeight > b.clientHeight + 1, focusable: b.tabIndex === 0 } }))`,
    ),
  )
}

test('at 1280 px a long plugin list scrolls inside its card and both cards share one height', { skip }, async () => {
  const [add, list] = await open('many', 1280, 900)
  assert.equal(Math.round(add.height), Math.round(list.height))
  assert.ok(list.height < 900, `row ${list.height} px stays inside the window`)
  assert.equal(list.scrolls, true)
  assert.equal(list.focusable, true, 'the scrolling list takes keyboard focus')
  assert.equal(add.scrolls, false)
  assert.equal(add.focusable, false)
})

test('at 1280 px on a short window the Add plugin card scrolls inside and both share one height', { skip }, async () => {
  const [add, list] = await open('none', 1280, 360)
  assert.equal(Math.round(add.height), Math.round(list.height))
  assert.equal(add.scrolls, true)
  assert.equal(add.focusable, true)
  assert.equal(list.scrolls, false)
})

test('stacked on a phone each card takes its natural height and nothing scrolls inside', { skip }, async () => {
  const cards = await open('many', 390, 800)
  for (const card of cards) assert.equal(card.scrolls, false, card.name)
  const [add, list] = cards
  assert.ok(list.height > add.height, 'the long list keeps its own height')
})

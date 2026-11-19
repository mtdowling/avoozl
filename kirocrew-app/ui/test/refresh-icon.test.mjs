// The Refresh button never shows the time left as text: no digits and no
// "32s" or "1:40" countdown inside it, on the app page or the side panel.
// Its age shows only by color (data-refresh-age) and in the tooltip.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

test('the Refresh source draws no countdown text', () => {
  const source = readFileSync(new URL('../src/RefreshButton.tsx', import.meta.url), 'utf8')
  const icon = source.slice(source.indexOf('export function RefreshIcon('), source.indexOf('export function RefreshButton('))
  // countdownText may name the button (aria-label) but is never a child.
  assert.doesNotMatch(icon, /(?<!\$)\{countdownText\(/)
  assert.doesNotMatch(source, /export function RefreshControl|countdownWidth/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the refresh icon tests'
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

const READ = `[...document.querySelectorAll('[data-refresh]')].map((b) => ({ text: b.textContent, label: b.getAttribute('aria-label') ?? '', age: b.dataset.refreshAge, color: getComputedStyle(b).color }))`
const SCREENS = [
  { name: 'Home', query: { page: 'app', basic: '1' }, ready: `document.querySelectorAll('[data-refresh]').length > 0` },
  // Activity publishes its Refresh to the top line, as Home does.
  { name: 'Activity', query: { page: 'app', activity: '1' }, nav: 'Activity', ready: `document.querySelectorAll('[data-refresh]').length > 0` },
  { name: 'the side panel', query: { page: 'panel', sid: 'chat-1' }, ready: `document.querySelectorAll('[data-refresh]').length > 0` },
]

for (const screen of SCREENS)
  for (const width of [1280, 390])
    test(`no countdown text inside Refresh on ${screen.name} at ${width} px`, { skip }, async () => {
      await page.open(harness.url(screen.query), { width, height: 800 })
      if (screen.nav) {
        const menu = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
        if (width < 768) {
          await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
          await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        }
        await page.until(`Boolean(document.querySelector('${menu} [data-nav-head]'))`)
        await page.evaluate(`[...document.querySelectorAll('${menu} [data-nav-head]')].find((b) => b.textContent.includes(${JSON.stringify(screen.nav)}))?.click()`)
        await page.until(`Boolean(document.querySelector('#avoozl-activity-title'))`)
      }
      if (width < 768 && screen.query.page === 'app' && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) {
        // A phone keeps Refresh in its menu.
        await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      }
      await page.until(screen.ready, 8000)
      // Let the countdown tick so a live number would show.
      await page.evaluate('new Promise((r) => setTimeout(r, 1500))')
      const buttons = await page.evaluate(READ)
      assert.ok(buttons.length > 0)
      for (const button of buttons) {
        assert.equal(button.text.trim(), '', `no text inside Refresh (${JSON.stringify(button.text)})`)
        assert.doesNotMatch(button.text, /\d|\bs\b/, 'no digits or seconds')
        assert.match(button.label, /^Refresh, /, 'its name says what it does')
        assert.match(String(button.age), /^\d+$/, 'its age is on the button for its color')
      }
    })

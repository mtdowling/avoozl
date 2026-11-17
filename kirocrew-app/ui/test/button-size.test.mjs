// No button or icon button is taller than 28 px on any screen, at 390 and
// 1280 px, light and dark. Kiro Crew's own buttons are about 24 px; there is no
// bigger "tap target" size on a phone. Checked on the Home page, every Settings
// section, the other tabs and the side panel. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the button size test'

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

const MAX = 28
// Buttons, links styled as buttons, and the panel's own icon buttons. A native
// select or text field is not a button.
// The side panel's section headers are disclosure rows the width of the panel, 38 px
// like Kiro Crew's own Crew log; they are rows, not buttons. The left nav's
// pills (section heads, their rows, the workspace pill) are 32 px rows, at the
// owner's ask; nav-overflow.test.mjs checks that size.
const BUTTONS = `button:not([data-pp-section-head]):not(summary):not([data-nav-head]):not([data-nav-item]):not([data-workspace-pill]), [role="button"], a[data-sc-act], a[data-pp-act]`
const tall = `[...document.querySelectorAll(${JSON.stringify(BUTTONS)})].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > ${MAX} + 0.5 }).map((el) => (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30) + ' ' + Math.round(el.getBoundingClientRect().height) + 'px')`

const SIZES = [
  { width: 390, height: 800, theme: 'dark', dark: true },
  { width: 1280, height: 900, theme: 'light', dark: false },
]
const SCREENS = [
  { name: 'Home', query: { page: 'app', radar: '1' }, ready: `Boolean(document.querySelector('[data-release-empty]'))` },
  { name: 'the side panel', query: { page: 'panel', sid: 'chat-1' }, ready: `Boolean(document.querySelector('[data-flight-row]'))` },
]
const TABS = ['Specs', 'Needs you', 'Trace', 'Flow', 'Activity', 'Settings']

for (const size of SIZES) {
  for (const screen of SCREENS)
    test(`no button on ${screen.name} is taller than ${MAX} px at ${size.width} px ${size.theme}`, { skip }, async () => {
      await page.open(harness.url({ ...screen.query, theme: size.theme }), { width: size.width, height: size.height, dark: size.dark })
      await page.until(screen.ready)
      // Open every section so its buttons are measured too.
      await page.evaluate(`document.querySelector('[data-pp-toggle-all][aria-pressed=false]')?.click()`)
      assert.deepEqual(await page.evaluate(tall), [])
    })

  test(`no button on the other tabs and Settings sections is taller than ${MAX} px at ${size.width} px ${size.theme}`, { skip }, async () => {
    await page.open(harness.url({ page: 'app', radar: '1', theme: size.theme }), { width: size.width, height: size.height, dark: size.dark })
    await page.until(`document.querySelectorAll('[data-sc]').length === 1`)
    const found = []
    const settle = () => new Promise((resolve) => setTimeout(resolve, 300))
    // On a phone the nav is behind the rail button; open it when it is shut.
    const openMenu = () => page.evaluate(`(() => { const bar = document.querySelector('[data-top-rail-bar]'); if (bar && bar.getAttribute('aria-expanded') !== 'true') bar.click(); return true })()`)
    for (const name of TABS) {
      await openMenu()
      await page.evaluate(`[...document.querySelectorAll('button[data-nav-head]')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(name)}))?.click()`)
      await settle()
      // The nav itself, with this section open.
      await openMenu()
      found.push(...(await page.evaluate(tall)).map((entry) => `nav at ${name}: ${entry}`))
      const pages = await page.evaluate(`[...document.querySelectorAll('[data-nav-children] [data-nav-item]')].map((b) => b.dataset.navItem)`)
      if (!pages.length) {
        // A plain section closes the phone's menu; measure the page.
        found.push(...(await page.evaluate(tall)).map((entry) => `${name}: ${entry}`))
        continue
      }
      for (const key of pages) {
        await openMenu()
        await page.evaluate(`document.querySelector('[data-nav-item="${key}"]')?.click()`)
        await settle()
        found.push(...(await page.evaluate(tall)).map((entry) => `${key}: ${entry}`))
      }
    }
    assert.deepEqual([...new Set(found)], [])
  })
}

// No tall tap size comes back in the source: no pointer:coarse bump and no
// 40-59 px height or minimum on anything.
test('no source file has a tall tap-target rule', async () => {
  const fs = await import('node:fs')
  const dir = new URL('../src/', import.meta.url)
  const bad = []
  for (const name of fs.readdirSync(dir).filter((n) => /\.(tsx?|css)$/.test(n))) {
    const text = fs.readFileSync(new URL(name, dir), 'utf8')
    for (const [i, line] of text.split('\n').entries())
      if (/pointer:\s*coarse|tap[- ]target|min-?height:\s*['"]?[45]\d(px)?\b|minHeight:\s*[45]\d\b|\bmin-h-(1[0-4]|\[[45]\d)/i.test(line)) bad.push(`${name}:${i + 1}`)
  }
  assert.deepEqual(bad, [])
})

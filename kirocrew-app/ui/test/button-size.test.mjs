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
// like Kiro Crew's own Crew log; they are rows, not buttons.
const BUTTONS = `button:not([data-pp-section-head]):not(summary), [role="button"], a[data-sc-act], a[data-pp-act]`
const tall = `[...document.querySelectorAll(${JSON.stringify(BUTTONS)})].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > ${MAX} + 0.5 }).map((el) => (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30) + ' ' + Math.round(el.getBoundingClientRect().height) + 'px')`

const SIZES = [
  { width: 390, height: 800, theme: 'dark', dark: true },
  { width: 1280, height: 900, theme: 'light', dark: false },
]
const SCREENS = [
  { name: 'Home', query: { page: 'app', radar: '1' }, ready: `document.querySelectorAll('[data-sc]').length === 2` },
  { name: 'the side panel', query: { page: 'panel', sid: 'chat-1' }, ready: `Boolean(document.querySelector('[data-flight-row]'))` },
  { name: 'the side panel in a driver chat', query: { page: 'panel', sid: 'avoozl_driver_1' }, ready: `Boolean(document.querySelector('[data-panel-driver]'))` },
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
    await page.until(`document.querySelectorAll('[data-sc]').length === 2`)
    const found = []
    for (const name of TABS) {
      // On a phone the tabs sit behind the rail button; open it first.
      await page.evaluate(`(() => {
        const tab = () => [...document.querySelectorAll('button[role="tab"]')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(name)}))
        if (!tab()) document.querySelector('[aria-controls="avoozl-top-rail-list"]')?.click()
        tab()?.click()
      })()`)
      await new Promise((resolve) => setTimeout(resolve, 400))
      if (name === 'Settings')
        for (const section of await page.evaluate(`[...document.querySelectorAll('[data-settings-section]')].map((s) => s.dataset.settingsSection)`)) {
          await page.evaluate(`document.querySelector('[data-settings-section="${section}"] button[aria-expanded]')?.click()`)
          await new Promise((resolve) => setTimeout(resolve, 200))
          found.push(...(await page.evaluate(tall)).map((entry) => `Settings/${section}: ${entry}`))
        }
      else found.push(...(await page.evaluate(tall)).map((entry) => `${name}: ${entry}`))
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

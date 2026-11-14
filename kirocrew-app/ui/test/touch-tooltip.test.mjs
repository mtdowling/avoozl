// The one Tooltip on touch and keyboard, in a real Chrome (AVOOZL_CHROME, or an
// installed one). A tap on plain text or an info icon opens it; a second tap,
// a tap elsewhere or Esc closes it; a button keeps its own tap and shows no
// tooltip on touch. A plain anchor takes keyboard focus and is described by
// its tip. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the touch tooltip tests'
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

const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 60))')
const center = (selector) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tip = () => page.evaluate(`[...(document.querySelector('[data-tooltip]')?.childNodes ?? [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('') || null`)
const open = async (dark = false) => {
  await page.open(harness.url({ page: 'tip', theme: dark ? 'dark' : 'light' }), { width: 390, height: 700, dark })
  await page.until(`Boolean(document.querySelector('[data-plain]'))`)
}
const tap = async (selector) => {
  const { x, y } = await center(selector)
  await page.tap(x, y)
  await settle()
}

for (const dark of [false, true])
  test(`touch: a tap toggles a plain tooltip, a tap outside or Esc closes it (${dark ? 'dark' : 'light'})`, { skip }, async () => {
    await open(dark)
    assert.equal(await tip(), null)
    await tap('[data-plain]')
    assert.equal(await tip(), 'Opened 2026-11-14 by Mira')
    await tap('[data-plain]')
    assert.equal(await tip(), null, 'the second tap closes it')
    await tap('[data-plain]')
    await tap('[data-elsewhere]')
    assert.equal(await tip(), null, 'a tap elsewhere closes it')
    await tap('[data-plain]')
    await page.key('Escape', 'Escape', 27)
    await settle()
    assert.equal(await tip(), null, 'Esc closes it')
    // The tip is inside the screen.
    await tap('[data-info-tip]')
    assert.equal(await tip(), 'Details that do not fit on the page')
    const box = await page.evaluate(`(() => { const r = document.querySelector('[data-tooltip]').getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth } })()`)
    assert.ok(box.left >= 0 && box.right <= box.width, 'inside the viewport')
  })

test('touch: a button acts on its tap and shows no tooltip', { skip }, async () => {
  await open()
  await tap('[data-act]')
  assert.equal(await page.evaluate(`document.querySelector('[data-clicks]').textContent`), '1')
  assert.equal(await tip(), null)
})

test('keyboard: a plain anchor is a focus stop described by its tip; the info icon opens on focus', { skip }, async () => {
  await open()
  const wired = await page.evaluate(`(() => {
    const a = document.querySelector('[data-plain]').parentElement
    const tipEl = document.getElementById(a.getAttribute('aria-describedby'))
    return { tabIndex: a.tabIndex, tip: tipEl?.textContent, role: tipEl?.getAttribute('role') }
  })()`)
  assert.deepEqual(wired, { tabIndex: 0, tip: 'Opened 2026-11-14 by Mira', role: 'tooltip' })
  await page.key('Tab', 'Tab', 9)
  await settle()
  assert.equal(await tip(), 'Opened 2026-11-14 by Mira', 'keyboard focus shows it')
  await page.key('Escape', 'Escape', 27)
  await settle()
  assert.equal(await tip(), null)
})

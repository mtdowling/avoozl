// The shelf in a real Chrome (AVOOZL_CHROME, or an installed one), opened from
// Settings > Repository setup > Configure on the harness app page. It slides
// in at the right edge, is full width at 390 px, keeps Tab inside, closes on
// Esc and on its Close button, and gives focus back to the button that
// opened it. Motion is off here (the harness sets prefers-reduced-motion).
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the shelf tests'
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

const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 80))')
const OPENER = `document.querySelector('[data-open-shelf="repositories"]')`
const SHELF = `document.querySelector('[data-settings-shelf="repositories"]')`

async function start(width, dark = false) {
  await page.open(harness.url({ page: 'app', radar: '1', theme: dark ? 'dark' : 'light' }), { width, height: 800, dark })
  await page.until(`Boolean(document.querySelector('[role="tab"]'))`)
  await page.evaluate(`[...document.querySelectorAll('button[role="tab"]')].find((b) => b.textContent.trim() === 'Settings').click()`)
  await page.until(`Boolean(document.querySelector('[data-settings-section="repositories"] button[aria-expanded]'))`)
  await page.evaluate(`document.querySelector('[data-settings-section="repositories"] button[aria-expanded]').click()`)
  await page.until(`Boolean(${OPENER})`)
}
const openShelf = async () => {
  await page.evaluate(`(() => { const b = ${OPENER}; b.focus(); b.click() })()`)
  await page.until(`Boolean(${SHELF})`)
  await settle()
}

for (const dark of [false, true])
  test(`desktop: the shelf sits at the right edge, ${dark ? 'dark' : 'light'}; Settings shows a Configure button, not the editor`, { skip }, async () => {
    await start(1280, dark)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-slot="mirror"]'))`), false, 'no editor inline')
    await openShelf()
    const box = await page.evaluate(`(() => { const r = ${SHELF}.querySelector('[data-modal-box]').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight } })()`)
    assert.equal(box.right, box.w, 'flush with the right edge')
    assert.ok(box.left > 300 && box.left < box.w - 400, 'a panel, not the whole page')
    assert.equal(box.top, 0)
    assert.equal(await page.evaluate(`getComputedStyle(${SHELF}.querySelector('[data-modal-box]')).animationName`), 'none', 'no slide under reduced motion')
    assert.equal(box.bottom, box.h)
    assert.equal(await page.evaluate(`Boolean(${SHELF}.querySelector('[data-slot="mirror"]'))`), true, 'the editor is in the shelf')
  })

test('mobile: the shelf is full width at 390 px', { skip }, async () => {
  await start(390)
  await openShelf()
  const box = await page.evaluate(`(() => { const r = ${SHELF}.querySelector('[data-modal-box]').getBoundingClientRect(); return { left: r.left, right: r.right, w: innerWidth } })()`)
  assert.equal(box.left, 0)
  assert.equal(box.right, box.w)
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'no sideways scroll')
})

test('Esc and the Close button close it and focus goes back to the opener; Tab stays inside', { skip }, async () => {
  await start(1280)
  await openShelf()
  const inside = `${SHELF}.contains(document.activeElement)`
  assert.equal(await page.evaluate(inside), true, 'focus starts inside')
  for (let i = 0; i < 40; i++) {
    await page.key('Tab', 'Tab', 9)
    assert.equal(await page.evaluate(inside), true, `Tab ${i + 1} stays inside`)
  }
  await page.key('Escape', 'Escape', 27)
  await page.until(`!${SHELF}`)
  assert.equal(await page.evaluate(`document.activeElement === ${OPENER}`), true, 'Esc returns focus to the opener')
  await openShelf()
  await page.evaluate(`${SHELF}.querySelector('[data-shelf-close]').click()`)
  await page.until(`!${SHELF}`)
  assert.equal(await page.evaluate(`document.activeElement === ${OPENER}`), true, 'Close returns focus to the opener')
})

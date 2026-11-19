// The Review tab's side column has a drag handle on its left edge: drag it,
// or focus it and use the arrow keys; double-click puts the default back; the
// width is kept in this browser; a phone has no handle. Real Chrome; skipped
// when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found'
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

const HANDLE = `document.querySelector('[role="separator"][aria-label="Resize the side column"]')`
const widths = () =>
  page.evaluate(
    `({ side: Math.round(document.querySelector('[data-review-rail]').getBoundingClientRect().width), doc: Math.round(document.querySelector('[data-review-doc]').getBoundingClientRect().width), now: Number(${HANDLE}.getAttribute('aria-valuenow')) })`,
  )

async function openReview(size) {
  await page.open(harness.url({ page: 'specs', review: '1' }), size)
  await page.evaluate(`localStorage.removeItem('avoozl:review-side-width')`)
  await page.open(harness.url({ page: 'specs', review: '1' }), size)
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await page.evaluate(`document.querySelector('[data-plan-row="spec:byte-types"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-open-review]'))`)
  await page.evaluate(`document.querySelector('[data-open-review]').click()`)
  await page.until(`Boolean(document.querySelector('[data-review-rail]'))`)
  await page.evaluate('new Promise((r) => setTimeout(r, 300))')
}

test('dragging the handle 200 px left widens the side column by about 200 px and narrows the text', { skip }, async () => {
  await openReview({ width: 1400, height: 900 })
  const before = await widths()
  assert.equal(before.side, 340)
  assert.equal(await page.evaluate(`${HANDLE}.getAttribute('aria-orientation')`), 'vertical')
  assert.equal(await page.evaluate(`getComputedStyle(${HANDLE}).cursor`), 'col-resize')
  const at = await page.evaluate(`(() => { const r = ${HANDLE}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 80) } })()`)
  await page.drag(at.x, at.y, at.x - 200)
  await page.evaluate('new Promise((r) => setTimeout(r, 200))')
  const after = await widths()
  assert.ok(Math.abs(after.side - before.side - 200) <= 6, `the column grew by ${after.side - before.side}`)
  assert.ok(Math.abs(before.doc - after.doc - 200) <= 6, `the text shrank by ${before.doc - after.doc}`)
  assert.equal(after.now, after.side)
  // The width is kept: open the page again and it is still wide.
  await page.open(harness.url({ page: 'specs', review: '1' }), { width: 1400, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await page.evaluate(`document.querySelector('[data-plan-row="spec:byte-types"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-open-review]'))`)
  await page.evaluate(`document.querySelector('[data-open-review]').click()`)
  await page.until(`Boolean(document.querySelector('[data-review-rail]'))`)
  await page.evaluate('new Promise((r) => setTimeout(r, 300))')
  assert.equal((await widths()).side, after.side)
  // Double-click puts the default back.
  await page.evaluate(`${HANDLE}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await page.until(`Math.round(document.querySelector('[data-review-rail]').getBoundingClientRect().width) === 340`)
  assert.deepEqual(page.errors, [])
})

test('arrow keys resize the focused handle, and the width stays between its limits', { skip }, async () => {
  await openReview({ width: 1400, height: 900 })
  const press = (key) => page.evaluate(`${HANDLE}.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`)
  await page.evaluate(`${HANDLE}.focus()`)
  // The handle is on the column's left edge: Left makes it wider.
  await press('ArrowLeft')
  await page.until(`Math.round(document.querySelector('[data-review-rail]').getBoundingClientRect().width) === 356`)
  await press('ArrowRight')
  await press('ArrowRight')
  await page.until(`Math.round(document.querySelector('[data-review-rail]').getBoundingClientRect().width) === 324`)
  // Dragged far past the ends it stops at the minimum and at the text's room.
  const at = await page.evaluate(`(() => { const r = ${HANDLE}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 80) } })()`)
  await page.drag(at.x, at.y, at.x + 900)
  await page.evaluate('new Promise((r) => setTimeout(r, 200))')
  const narrow = await widths()
  assert.equal(narrow.side, 240)
  assert.equal(await page.evaluate(`${HANDLE}.getAttribute('aria-valuemin')`), '240')
  const grab = await page.evaluate(`(() => { const r = ${HANDLE}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 80) } })()`)
  await page.drag(grab.x, grab.y, grab.x - 1200)
  await page.evaluate('new Promise((r) => setTimeout(r, 200))')
  const wide = await widths()
  assert.ok(wide.side <= 640, `at most 640 (${wide.side})`)
  assert.ok(wide.doc >= 300, `the text keeps room (${wide.doc})`)
  await page.evaluate(`localStorage.removeItem('avoozl:review-side-width')`)
})

test('a phone has no handle: the column sits under the text', { skip }, async () => {
  await openReview({ width: 390, height: 844 })
  assert.equal(await page.evaluate(`Boolean(${HANDLE})`), false)
  assert.equal(await page.evaluate(`document.querySelector('[data-review-layout]').dataset.reviewLayout`), 'inline')
})

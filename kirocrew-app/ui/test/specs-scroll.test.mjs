// On a desktop the Specs page does not scroll: the list and the spec view
// fill the height below the header and scroll inside themselves; the spec's
// tab bar stays put while a document and its inline review comments
// scroll under it. In a real Chrome, full app shell. Skipped when no Chrome is found.
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
const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const wait = (ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)

async function openApp(height, open = true) {
  await page.open(harness.url({ page: 'app', basic: '1', specs: '1', review: '1' }), { width: 1280, height })
  await page.until(`Boolean(document.querySelector('[data-top-row] [data-nav-head]'))`, 30000)
  await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
  if (open) {
    await click('[data-plan-row="spec:byte-types"]')
    await page.until(`Boolean(document.querySelector('[data-spec-tab]'))`, 30000)
    await wait(400)
  }
}

// Nothing on the page scrolls: not the document, and not the app's pane.
const pageFits = () =>
  page.evaluate(`(() => {
    const pane = document.querySelector('[data-avoozl-pane]')
    return { doc: document.scrollingElement.scrollHeight - innerHeight, pane: pane.scrollHeight - pane.clientHeight }
  })()`)
const scrolls = (selector) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const room = el.scrollHeight - el.clientHeight
    el.scrollTop = 40
    return { overflowY: getComputedStyle(el).overflowY, room, moved: el.scrollTop > 0 }
  })()`)

test('at 1280x800 the page does not scroll, and the list and the spec view each scroll inside themselves', { skip }, async () => {
  await openApp(800)
  const fit = await pageFits()
  assert.equal(fit.doc, 0, 'the document is the viewport tall ' + JSON.stringify(fit))
  assert.ok(fit.pane <= 1, `the app pane does not scroll (${fit.pane})`)
  // The spec view's body scrolls; the tab bar does not move with it.
  const barBefore = await page.evaluate(`Math.round(document.querySelector('[data-spec-tab="overview"]').getBoundingClientRect().top)`)
  const body = await scrolls('[data-spec-body]')
  assert.equal(body.overflowY, 'auto')
  assert.ok(body.room > 0 && body.moved, `the view scrolls (${JSON.stringify(body)})`)
  assert.equal(await page.evaluate(`Math.round(document.querySelector('[data-spec-tab="overview"]').getBoundingClientRect().top)`), barBefore, 'the tab bar stays')
  assert.deepEqual(await pageFits(), fit)
  // The list is a column of the page's height, scrolling by itself.
  const list = await scrolls('[data-list-pane="specs"]')
  assert.equal(list.overflowY, 'auto')
  assert.equal(await page.evaluate(`Math.round(document.querySelector('[data-list-pane="specs"]').getBoundingClientRect().bottom) <= innerHeight`), true)
  assert.deepEqual(page.errors, [])
})

test('a short window keeps the page still and the list scrolls', { skip }, async () => {
  await openApp(420)
  const fit = await pageFits()
  assert.equal(fit.doc, 0, JSON.stringify(fit))
  assert.ok(fit.pane <= 1, `the app pane does not scroll (${fit.pane})`)
  const list = await scrolls('[data-list-pane="specs"]')
  assert.ok(list.room > 0 && list.moved, `the list scrolls (${JSON.stringify(list)})`)
  assert.deepEqual(await pageFits(), fit)
})

test('with no spec open the list fills the height and scrolls', { skip }, async () => {
  await openApp(420, false)
  const fit = await pageFits()
  assert.equal(fit.doc, 0, JSON.stringify(fit))
  assert.ok(fit.pane <= 1, `the app pane does not scroll (${fit.pane})`)
  const list = await scrolls('[data-list-pane="specs"]')
  assert.equal(list.overflowY, 'auto')
  assert.ok(list.room > 0 && list.moved, `the list scrolls (${JSON.stringify(list)})`)
})

test('on a document tab the text and its inline comments scroll in the spec body, under a fixed tab bar', { skip }, async () => {
  await openApp(640)
  await click('[data-spec-tab="requirements.md"]')
  await page.until(`Boolean(document.querySelector('[data-finding-card]'))`, 30000)
  await wait(400)
  const fit = await pageFits()
  assert.equal(fit.doc, 0, JSON.stringify(fit))
  assert.ok(fit.pane <= 1, `the app pane does not scroll (${fit.pane})`)
  const bar = await page.evaluate(`Math.round(document.querySelector('[data-spec-tab="overview"]').getBoundingClientRect().top)`)
  const body = await scrolls('[data-spec-body]')
  assert.equal(body.overflowY, 'auto')
  assert.ok(body.room > 0 && body.moved, `the body scrolls (${JSON.stringify(body)})`)
  assert.equal(await page.evaluate(`Math.round(document.querySelector('[data-spec-tab="overview"]').getBoundingClientRect().top)`), bar)
  assert.deepEqual(await pageFits(), fit)
  assert.deepEqual(page.errors, [])
})

test('a phone keeps the normal page scroll', { skip }, async () => {
  await page.open(harness.url({ page: 'app', basic: '1', specs: '1', review: '1' }), { width: 390, height: 700 })
  await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`, 30000)
  await click('[data-top-rail-bar]')
  await wait(300)
  await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
  await wait(300)
  if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)) await click('[data-top-rail-bar]')
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
  await click('[data-plan-row="spec:byte-types"]')
  await page.until(`Boolean(document.querySelector('[data-spec-tab]'))`, 30000)
  await wait(400)
  assert.equal(await page.evaluate(`(() => { const p = document.querySelector('[data-avoozl-pane]'); return p.scrollHeight > p.clientHeight + 100 })()`), true, 'the pane scrolls')
  assert.equal(await page.evaluate(`document.querySelector('[data-spec-body]') ? getComputedStyle(document.querySelector('[data-spec-body]')).overflowY : 'visible'`), 'visible')
})

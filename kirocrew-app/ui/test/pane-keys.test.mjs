// The Specs page's keys in a real Chrome (browser/harness.tsx &review=1):
// Home, End, Page Up and Page Down scroll the pane under the mouse, not the
// window, and leave a focused text box alone. Skipped when no Chrome.
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

async function openSpec(params = {}, size = { width: 1280, height: 800 }) {
  await page.open(harness.url({ page: 'specs', review: '1', ...params }), size)
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await page.until(`Boolean(document.querySelector('[data-spec-tab="overview"]'))`)
}

test('Page Down and End scroll the pane under the mouse, not the page, and skip a search box', { skip }, async () => {
  await openSpec({}, { width: 1280, height: 560 })
  await page.until(`Boolean(document.querySelector('[data-spec-details-box]'))`)
  // Fill the details box so it can scroll, and bring it into view.
  await page.evaluate(`document.querySelector('[data-spec-details-box]').style.maxHeight = '120px'`)
  await page.evaluate(`(() => { const body = document.querySelector('[data-spec-body]'), box = document.querySelector('[data-spec-details-box]'); body.scrollTop += box.getBoundingClientRect().top - body.getBoundingClientRect().top - 20 })()`)
  const box = await page.evaluate(`(() => { const r = document.querySelector('[data-spec-details-box]').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 } })()`)
  await page.evaluate(`document.activeElement?.blur()`)
  await page.hover(box.x, box.y)
  const tops = () => page.evaluate(`[document.querySelector('[data-spec-details-box]').scrollTop, document.querySelector('[data-spec-body]').scrollTop, document.scrollingElement.scrollTop]`)
  const [, bodyBefore, winBefore] = await tops()
  await page.key('PageDown', 'PageDown', 34)
  const [details, body, win] = await tops()
  assert.ok(details > 0, 'the details box scrolled')
  assert.equal(body, bodyBefore, 'not the tab content')
  assert.equal(win, winBefore, 'not the page')
  await page.key('Home', 'Home', 36)
  assert.equal((await tops())[0], 0)
  // Over the list, End goes to its bottom.
  const list = await page.evaluate(`(() => { const r = document.querySelector('[data-list-pane="specs"]').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 200 } })()`)
  await page.hover(list.x, list.y)
  await page.key('End', 'End', 35)
  const metrics = await page.evaluate(`(() => { const el = document.querySelector('[data-list-pane="specs"]'); return [el.scrollTop, el.clientHeight, el.scrollHeight] })()`)
  assert.ok(metrics[0] > 0 && Math.abs(metrics[0] + metrics[1] - metrics[2]) <= 1, JSON.stringify(metrics))
  // Typing in a text box keeps its own keys.
  await page.evaluate(`document.querySelector('[data-list-pane="specs"]').scrollTop = 0`)
  await page.evaluate(`document.querySelector('input[type="search"]')?.focus()`)
  await page.key('End', 'End', 35)
  assert.equal(await page.evaluate(`document.querySelector('[data-list-pane="specs"]').scrollTop`), 0)
})

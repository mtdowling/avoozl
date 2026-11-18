// The spec page's tab bar in a real Chrome (browser/harness.tsx &review=1):
// Overview, Tasks, one tab per spec file with its open-finding count, and
// Review; arrow keys move between tabs; no details panel in the list column;
// the Overview holds the Summary, a scrolling details box and the Frontier.
// Skipped when no Chrome is found.
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
const text = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
const exists = (selector) => page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
const tabs = () => page.evaluate(`[...document.querySelectorAll('[data-spec-tab]')].map((t) => t.dataset.specTab)`)
const selected = () => page.evaluate(`[...document.querySelectorAll('[data-spec-tab]')].filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.dataset.specTab)`)

async function openSpec(size = { width: 1280, height: 900 }, params = {}) {
  await page.open(harness.url({ page: 'specs', review: '1', ...params }), size)
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await page.until(`Boolean(document.querySelector('[data-spec-tab]'))`)
}

for (const [width, height] of [
  [1280, 900],
  [390, 844],
])
  test(`the tab bar has Overview, Tasks, each spec file and Review at ${width}`, { skip }, async () => {
    await openSpec({ width, height })
    assert.deepEqual(await tabs(), ['overview', 'tasks', 'requirements.md', 'design.md', 'tasks.md', 'review'])
    assert.deepEqual(await selected(), ['overview'])
    // A file's tab carries its open-finding count, as the Review view's does.
    assert.equal(await page.evaluate(`document.querySelector('[data-spec-tab="requirements.md"] [data-tab-count]').textContent`), '2')
    assert.equal(await page.evaluate(`document.querySelector('[data-spec-tab="design.md"] [data-tab-count]').textContent`), '1')
    assert.equal(await exists('[data-spec-tab="overview"] [data-tab-count]'), false)
    // The bar scrolls sideways on its own when it does not fit; the page does not.
    assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('[role=tablist][aria-label="Spec views"]')).overflowX`), 'auto')
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true)
    assert.deepEqual(page.errors, [])
  })

test('the Overview holds the Summary, a scrolling details box and the Frontier, and the list column has no panel', { skip }, async () => {
  await openSpec()
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-spec-card]')].map((c) => c.dataset.specCard).slice(0, 3)`), ['Summary', 'Spec details', 'Task graph'])
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('[data-spec-details-box]')).overflowY`), 'auto')
  assert.equal(await exists('[data-spec-details-box] [data-spec-rail]'), true)
  assert.equal(await exists('[data-spec-panel]'), false)
  // The list column is the whole list: nothing docked under it.
  assert.equal(await exists('[data-spec-split]'), false)
  // The other tabs show none of the Overview's cards.
  await click('[data-spec-tab="tasks"]')
  await page.until(`Boolean(document.querySelector('[data-focus-tree]'))`)
  assert.equal(await exists('[data-spec-details-box]'), false)
  assert.equal(await exists('[data-spec-summary]'), false)
})

test('a document tab shows the rendered file, and Review shows the findings in the same tab bar', { skip }, async () => {
  await openSpec()
  await click('[data-spec-tab="design.md"]')
  await page.until(`Boolean(document.querySelector('[data-spec-card="design.md"]'))`)
  assert.match(await text('[data-spec-card="design.md"]'), /The loader reads/)
  assert.equal(await exists('[data-spec-card="requirements.md"]'), false)
  await click('[data-spec-tab="tasks.md"]')
  await page.until(`/Facts:/.test(document.querySelector('[data-spec-card="tasks.md"]')?.textContent ?? '')`)
  await click('[data-spec-tab="review"]')
  await page.until(`Boolean(document.querySelector('[data-finding-card]'))`)
  assert.deepEqual(await selected(), ['review'])
  assert.equal(await exists('[data-review-close]'), false)
  assert.equal(await exists('[data-spec-tab="overview"]'), true)
  await click('[data-spec-tab="overview"]')
  await page.until(`Boolean(document.querySelector('[data-spec-summary]'))`)
  assert.equal(await exists('[data-finding-card]'), false)
  assert.deepEqual(page.errors, [])
})

test('arrow keys, Home and End move between the tabs', { skip }, async () => {
  await openSpec()
  const press = (key) => page.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`)
  await page.evaluate(`document.querySelector('[data-spec-tab="overview"]').focus()`)
  await press('ArrowRight')
  await page.until(`document.querySelector('[data-spec-tab="tasks"]').getAttribute('aria-selected') === 'true'`)
  assert.equal(await page.evaluate(`document.activeElement.dataset.specTab`), 'tasks')
  await press('End')
  await page.until(`document.querySelector('[data-spec-tab="review"]').getAttribute('aria-selected') === 'true'`)
  await press('ArrowRight')
  await page.until(`document.querySelector('[data-spec-tab="overview"]').getAttribute('aria-selected') === 'true'`)
  await press('ArrowLeft')
  await page.until(`document.querySelector('[data-spec-tab="review"]').getAttribute('aria-selected') === 'true'`)
  await press('Home')
  await page.until(`document.querySelector('[data-spec-tab="overview"]').getAttribute('aria-selected') === 'true'`)
  assert.equal(await page.evaluate(`document.querySelector('[data-spec-tab="tasks"]').tabIndex`), -1)
})

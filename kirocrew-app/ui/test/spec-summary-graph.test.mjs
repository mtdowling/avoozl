// The spec page's Summary and Task graph in a real Chrome (browser/harness.tsx
// &review=1): the summary is read from the stored per-revision review summary,
// never written on open; the AI working box shows while it is pending; the
// Task graph draws this spec's tasks and edges; the task list stays reachable.
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

async function openSpec(params, size = { width: 1280, height: 900 }) {
  await page.open(harness.url({ page: 'specs', review: '1', ...params }), size)
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await page.until(`Boolean(document.querySelector('[data-spec-summary]'))`)
}

test('a stored summary shows at once with the data under it, and a second open starts no review', { skip }, async () => {
  await openSpec({})
  assert.match(await text('[data-spec-summary-text]'), /^Adds fixed-width byte types/)
  assert.equal(await exists('[data-review-working]'), false)
  assert.match(await text('[data-spec-summary-data]'), /Revision 3 · c0ffee12c0ff · draft/)
  assert.match(await text('[data-spec-summary-data]'), /\.kiro\/specs\/byte-types\/ · requirements\.md/)
  const first = await text('[data-spec-summary-text]')
  // Leave the spec and come back: the same stored text, and no review was started.
  await page.evaluate(`document.querySelector('[data-plan-row]:not([data-plan-row="spec:byte-types"])').click()`)
  await click('[data-plan-row="spec:byte-types"]')
  await page.until(`Boolean(document.querySelector('[data-spec-summary-text]'))`)
  assert.equal(await text('[data-spec-summary-text]'), first)
  const decides = (await page.evaluate('window.__harness.calls')).filter((c) => c.operation === 'plan.review.decide')
  assert.deepEqual(decides, [])
  assert.deepEqual(page.errors, [])
})

test('the AI working box shows while the summary is written, then the text replaces it', { skip }, async () => {
  await openSpec({ summary: 'running' })
  assert.equal(await exists('[data-review-working]'), true)
  assert.match(await text('[data-review-working]'), /AI working/)
  assert.equal(await exists('[data-spec-summary-text]'), false)
  // The data is there while it works.
  assert.match(await text('[data-spec-summary-data]'), /Revision 3/)
  // The sweep stops under reduced motion; the box stays.
  await page.evaluate('window.__summaryReady()')
  await page.until(`Boolean(document.querySelector('[data-spec-summary-text]'))`)
  assert.equal(await exists('[data-review-working]'), false)
  assert.match(await text('[data-spec-summary-text]'), /^Adds fixed-width byte types/)
})

test('with no summary and no review running the line says so and Retry reads again', { skip }, async () => {
  await openSpec({ summary: 'none' })
  assert.match(await text('[data-spec-summary-fallback]'), /^Summary unavailable\s+Retry/)
  assert.match(await text('[data-spec-summary-data]'), /Revision 3/)
  await click('[data-spec-summary-retry]')
  await page.until(`Boolean(document.querySelector('[data-spec-summary-fallback]'))`)
  assert.deepEqual(page.errors, [])
})

for (const [width, height] of [
  [1280, 900],
  [390, 844],
])
  test(`the Overview shows the Frontier and the Tasks tab the whole tree and the list at ${width}`, { skip }, async () => {
    await openSpec({}, { width, height })
    await page.until(`Boolean(document.querySelector('[data-spec-graph] [data-frontier]'))`)
    // Frontier: 1.2 just unlocked (its blocker is done); 1.3 and 1.4 wait.
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-spec-graph] [data-frontier-row]')].map((r) => r.dataset.frontierRow)`), ['1.2', '1.3', '1.4'])
    assert.equal(await exists('[data-spec-graph-tab]'), false)
    assert.equal(await exists('[data-focus-tree]'), false)
    // Tasks: the spec's whole tree, its four tasks and its live edges, then the list.
    await click('[data-spec-tab="tasks"]')
    await page.until(`Boolean(document.querySelector('[data-spec-graph] [data-focus-tree="spec:byte-types"]'))`)
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-spec-graph] [data-tree-node]')].map((n) => n.dataset.treeNode).sort()`), [
      '1.1',
      '1.2',
      '1.3',
      '1.4',
    ])
    assert.match(await text('[data-spec-graph] [data-tree-stat]'), /4 nodes · 2 live edges/)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true)
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-phase-tasks] li').length`), 4)
    assert.deepEqual(page.errors, [])
  })

const { specGraphHref } = await import('../src/focus-tree.ts')
test('the spec graph links to the Graph tree on the app route only', () => {
  assert.equal(specGraphHref('/apps/avoozl', 'byte-types'), '/apps/avoozl?tree=spec%3Abyte-types')
  assert.equal(specGraphHref('/popout/apps/avoozl', 'byte-types'), null)
})

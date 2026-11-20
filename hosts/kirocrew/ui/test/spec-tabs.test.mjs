// The spec page's tab bar in a real Chrome (browser/harness.tsx &review=1):
// Overview, Tasks, and one tab per spec file with its open-comment count (the
// comments show inline there, so there is no Review tab); arrow keys move
// between tabs; no details panel in the list column;
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
  test(`the tab bar has Overview, Tasks and each spec file at ${width}`, { skip }, async () => {
    await openSpec({ width, height })
    assert.deepEqual(await tabs(), ['overview', 'tasks', 'requirements.md', 'design.md', 'tasks.md'])
    assert.deepEqual(await selected(), ['overview'])
    // A file's tab carries its open-comment count.
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

test('a document tab shows the rendered file with its review comments inline', { skip }, async () => {
  await openSpec()
  await click('[data-spec-tab="design.md"]')
  await page.until(`Boolean(document.querySelector('[data-spec-card="design.md"] [data-finding-card]'))`)
  assert.match(await text('[data-spec-card="design.md"]'), /The loader reads/)
  assert.equal(await exists('[data-spec-card="design.md"] [data-inline-thread] [data-finding-card="f-info"]'), true)
  assert.equal(await exists('[data-spec-card="requirements.md"]'), false)
  await click('[data-spec-tab="tasks.md"]')
  await page.until(`/\\$done: A byte/.test(document.querySelector('[data-spec-card="tasks.md"]')?.textContent ?? '')`)
  assert.equal(await exists('[data-spec-card="tasks.md"] [data-finding-card]'), false, 'tasks.md has no comments')
  assert.equal(await exists('[data-review-view]'), false, 'no separate Review page')
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
  await page.until(`document.querySelector('[data-spec-tab="tasks.md"]').getAttribute('aria-selected') === 'true'`)
  await press('ArrowRight')
  await page.until(`document.querySelector('[data-spec-tab="overview"]').getAttribute('aria-selected') === 'true'`)
  await press('ArrowLeft')
  await page.until(`document.querySelector('[data-spec-tab="tasks.md"]').getAttribute('aria-selected') === 'true'`)
  await press('Home')
  await page.until(`document.querySelector('[data-spec-tab="overview"]').getAttribute('aria-selected') === 'true'`)
  assert.equal(await page.evaluate(`document.querySelector('[data-spec-tab="tasks"]').tabIndex`), -1)
})

test('Tasks by phase puts each task on one bulleted line, and a long title fades out and ends in an ellipsis', { skip }, async () => {
  await openSpec()
  await click('[data-spec-tab="tasks"]')
  await page.until(`Boolean(document.querySelector('[data-phase-tasks] [data-phase-task]'))`)
  const rows = await page.evaluate(
    `[...document.querySelectorAll('[data-phase-task]')].map((li) => ({ bullet: li.querySelector('[data-phase-task-bullet]')?.textContent, oneLine: li.getBoundingClientRect().height < parseFloat(getComputedStyle(li).fontSize) * 2.2 }))`,
  )
  assert.ok(rows.length > 1)
  for (const row of rows) assert.deepEqual(row, { bullet: '•', oneLine: true })
  // Short titles fit: no fade and no ellipsis.
  assert.equal(await exists('[data-phase-task] [data-fade-text][data-clipped]'), false)
  // Narrow the card until a title cannot fit: it fades and ends in "…".
  await page.evaluate(`document.querySelector('[data-phase-tasks]').style.width = '170px'`)
  await page.until(`Boolean(document.querySelector('[data-phase-task] [data-fade-text][data-clipped]'))`)
  const clipped = '[data-phase-task] [data-fade-text][data-clipped]'
  assert.equal(await text(`${clipped} [data-fade-text-more]`), '…')
  assert.match(await page.evaluate(`getComputedStyle(document.querySelector('${clipped} [data-fade-text-body]')).maskImage`), /linear-gradient/)
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('${clipped} [data-fade-text-body]')).whiteSpace`), 'nowrap')
  assert.deepEqual(page.errors, [])
})

test('a task shows its refs as chips, and a chip opens its file at that line', { skip }, async () => {
  await openSpec()
  await click('[data-spec-tab="tasks"]')
  await page.until(`Boolean(document.querySelector('[data-phase-task="1.1"] [data-task-ref]'))`)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-phase-task="1.1"] [data-task-ref]')].map((c) => c.dataset.taskRef)`), ['R1.1', '§D1'])
  assert.equal(await exists('[data-phase-task="1.3"] [data-task-refs]'), false, 'a task with no refs has no chips')
  // The title is shown without its refs.
  assert.equal(await text('[data-phase-task="1.1"] [data-fade-text-body]'), 'Add fixed-width integer types')
  // Requirement chip: the requirements tab, at criterion 1 of Requirement 1.
  await click('[data-phase-task="1.1"] [data-task-ref="R1.1"]')
  await page.until(`Boolean(document.querySelector('[data-spec-card="requirements.md"] [data-ref-target]'))`)
  assert.deepEqual(await selected(), ['requirements.md'])
  assert.match(await text('[data-spec-card="requirements.md"] [data-ref-target]'), /A byte value SHALL hold 0 to 255/)
  // Design chip: the design tab, at the D1 heading.
  await click('[data-spec-tab="tasks"]')
  await page.until(`Boolean(document.querySelector('[data-phase-task="1.1"] [data-task-ref="§D1"]'))`)
  await click('[data-phase-task="1.1"] [data-task-ref="§D1"]')
  await page.until(`Boolean(document.querySelector('[data-spec-card="design.md"] [data-ref-target]'))`)
  assert.deepEqual(await selected(), ['design.md'])
  assert.match(await text('[data-spec-card="design.md"] [data-ref-target]'), /D1\. Layout/)
  assert.deepEqual(page.errors, [])
})

test('Spec details reads like an about box: one tight row per section, small muted labels in one column, values at one edge', { skip }, async () => {
  await openSpec()
  await page.until(`Boolean(document.querySelector('[data-spec-details-box] [data-rail-section="Epic"]'))`)
  const got = await page.evaluate(`(() => {
    const sections = [...document.querySelectorAll('[data-spec-details-box] [data-rail-section]')]
    const left = (el) => Math.round(el.getBoundingClientRect().left)
    const label = sections[0].querySelector('h4'), body = sections[0].querySelector('[data-rail-body]')
    return {
      labels: [...new Set(sections.map((s) => left(s.querySelector('h4'))))].length,
      values: [...new Set(sections.map((s) => left(s.querySelector('[data-rail-body]'))))].length,
      beside: Math.round(label.getBoundingClientRect().top) === Math.round(body.getBoundingClientRect().top) && left(body) > left(label),
      label: [getComputedStyle(label).fontSize, getComputedStyle(label).textTransform, getComputedStyle(label).color === getComputedStyle(document.querySelector('[data-spec-details-box] [data-spec-links-row] dt')).color],
      epicHeight: Math.round(sections[0].getBoundingClientRect().height),
      linkRow: (() => { const row = document.querySelector('[data-spec-links-row="Spec issue"]'); return Math.round(row.querySelector('dt').getBoundingClientRect().top) === Math.round(row.querySelector('dd').getBoundingClientRect().top) })(),
    }
  })()`)
  assert.equal(got.labels, 1, 'every label starts at one edge')
  assert.equal(got.values, 1, 'every value starts at one edge')
  assert.equal(got.beside, true, 'the value sits beside its label')
  assert.deepEqual(got.label, ['12px', 'none', true], 'small muted labels')
  assert.ok(got.epicHeight <= 30, `a one-line row is tight (${got.epicHeight})`)
  assert.equal(got.linkRow, true, "a link's label and value share a line")
  assert.deepEqual(page.errors, [])
})

for (const [width, height] of [
  [1280, 900],
  [390, 844],
])
  test(`the spec tabs are a square, full-bleed tabbed heading at ${width}`, { skip }, async () => {
    await openSpec({ width, height })
    const got = await page.evaluate(`(() => {
      const bar = document.querySelector('[role=tablist][aria-label="Spec views"]'), tabs = [...bar.querySelectorAll('[role=tab]')]
      const open = bar.querySelector('[aria-selected=true]'), column = document.querySelector('[data-spec-detail]').parentElement
      const edge = column.getBoundingClientRect().left + parseFloat(getComputedStyle(column).borderLeftWidth)
      return {
        look: bar.dataset.tabsLook,
        radius: getComputedStyle(open).borderTopLeftRadius,
        gap: getComputedStyle(bar).columnGap,
        left: Math.round(open.getBoundingClientRect().left - edge),
        right: Math.round(column.getBoundingClientRect().right - bar.getBoundingClientRect().right),
        fill: getComputedStyle(open).backgroundColor !== 'rgba(0, 0, 0, 0)',
        fills: bar.scrollWidth > bar.clientWidth || Math.abs(tabs.reduce((sum, t) => sum + t.getBoundingClientRect().width, 0) - bar.clientWidth) < 2,
      }
    })()`)
    assert.deepEqual(got, { look: 'heading', radius: '0px', gap: '0px', left: 0, right: 0, fill: true, fills: true })
    assert.deepEqual(page.errors, [])
  })

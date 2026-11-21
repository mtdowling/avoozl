// The spec page's tab bar in a real Chrome (browser/harness.tsx &stored=1):
// Overview, Tasks, and one tab per spec file; arrow keys move
// between tabs; no details panel in the list column;
// the Overview holds the Summary, a scrolling details box and the Frontier.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { harnessPage } from './browser/harness-page.ts'

const state = harnessPage('spec tabs')
const { skip } = state
const click = (selector: string) => state.page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const text = (selector: string) => state.page.evaluate<string | null>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
const exists = (selector: string) => state.page.evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
const tabs = () => state.page.evaluate<string[]>(`[...document.querySelectorAll('[data-spec-tab]')].map((t) => t.dataset.specTab)`)
const selected = () =>
  state.page.evaluate<string[]>(`[...document.querySelectorAll('[data-spec-tab]')].filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.dataset.specTab)`)

async function openSpec(size = { width: 1280, height: 900 }, params = {}) {
  await state.page.open(state.harness.url({ page: 'specs', stored: '1', ...params }), size)
  await state.page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await state.page.until(`Boolean(document.querySelector('[data-spec-tab]'))`)
}

for (const [width, height] of [
  [1280, 900],
  [390, 844],
])
  test(`the tab bar has Overview, Tasks and each spec file at ${width}`, { skip }, async () => {
    await openSpec({ width, height })
    assert.deepEqual(await tabs(), ['overview', 'tasks', 'requirements.md', 'design.md', 'tasks.md'])
    assert.deepEqual(await selected(), ['overview'])
    // The bar scrolls sideways on its own when it does not fit; the page does not.
    assert.equal(await state.page.evaluate(`getComputedStyle(document.querySelector('[role=tablist][aria-label="Spec views"]')).overflowX`), 'auto')
    assert.equal(await state.page.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true)
    assert.deepEqual(state.page.errors, [])
  })

test('the Overview holds the Summary, a scrolling details box and the Frontier, and the list column has no panel', { skip }, async () => {
  await openSpec()
  assert.deepEqual(await state.page.evaluate(`[...document.querySelectorAll('[data-spec-card]')].map((c) => c.dataset.specCard).slice(0, 3)`), [
    'Summary',
    'Spec details',
    'Task graph',
  ])
  assert.equal(await state.page.evaluate(`getComputedStyle(document.querySelector('[data-spec-details-box]')).overflowY`), 'auto')
  assert.equal(await exists('[data-spec-details-box] [data-spec-rail]'), true)
  assert.equal(await exists('[data-spec-panel]'), false)
  // The list column is the whole list: nothing docked under it.
  assert.equal(await exists('[data-spec-split]'), false)
  // The other tabs show none of the Overview's cards.
  await click('[data-spec-tab="tasks"]')
  await state.page.until(`Boolean(document.querySelector('[data-focus-tree]'))`)
  assert.equal(await exists('[data-spec-details-box]'), false)
  assert.equal(await exists('[data-spec-summary]'), false)
})

test('a document tab shows the rendered file', { skip }, async () => {
  await openSpec()
  await click('[data-spec-tab="design.md"]')
  await state.page.until(`/The loader reads/.test(document.querySelector('[data-spec-card="design.md"]')?.textContent ?? '')`)
  assert.equal(await exists('[data-spec-card="requirements.md"]'), false)
  await click('[data-spec-tab="tasks.md"]')
  await state.page.until(`/A byte/.test(document.querySelector('[data-spec-card="tasks.md"]')?.textContent ?? '')`)
  await click('[data-spec-tab="overview"]')
  await state.page.until(`Boolean(document.querySelector('[data-spec-summary]'))`)
  assert.deepEqual(state.page.errors, [])
})

test('arrow keys, Home and End move between the tabs', { skip }, async () => {
  await openSpec()
  const press = (key: string) =>
    state.page.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`)
  await state.page.evaluate(`document.querySelector('[data-spec-tab="overview"]').focus()`)
  await press('ArrowRight')
  await state.page.until(`document.querySelector('[data-spec-tab="tasks"]').getAttribute('aria-selected') === 'true'`)
  assert.equal(await state.page.evaluate(`document.activeElement.dataset.specTab`), 'tasks')
  await press('End')
  await state.page.until(`document.querySelector('[data-spec-tab="tasks.md"]').getAttribute('aria-selected') === 'true'`)
  await press('ArrowRight')
  await state.page.until(`document.querySelector('[data-spec-tab="overview"]').getAttribute('aria-selected') === 'true'`)
  await press('ArrowLeft')
  await state.page.until(`document.querySelector('[data-spec-tab="tasks.md"]').getAttribute('aria-selected') === 'true'`)
  await press('Home')
  await state.page.until(`document.querySelector('[data-spec-tab="overview"]').getAttribute('aria-selected') === 'true'`)
  assert.equal(await state.page.evaluate(`document.querySelector('[data-spec-tab="tasks"]').tabIndex`), -1)
})

test('Tasks by phase puts each task on one bulleted line, and a long title fades out and ends in an ellipsis', { skip }, async () => {
  await openSpec()
  await click('[data-spec-tab="tasks"]')
  await state.page.until(`Boolean(document.querySelector('[data-phase-tasks] [data-phase-task]'))`)
  const rows = await state.page.evaluate<{ bullet: string | undefined; oneLine: boolean }[]>(
    `[...document.querySelectorAll('[data-phase-task]')].map((li) => ({ bullet: li.querySelector('[data-phase-task-bullet]')?.textContent, oneLine: li.getBoundingClientRect().height < parseFloat(getComputedStyle(li).fontSize) * 2.2 }))`,
  )
  assert.ok(rows.length > 1)
  for (const row of rows) assert.deepEqual(row, { bullet: '•', oneLine: true })
  // Short titles fit: no fade and no ellipsis.
  assert.equal(await exists('[data-phase-task] [data-fade-text][data-clipped]'), false)
  // Narrow the card until a title cannot fit: it fades and ends in "…".
  await state.page.evaluate(`document.querySelector('[data-phase-tasks]').style.width = '170px'`)
  await state.page.until(`Boolean(document.querySelector('[data-phase-task] [data-fade-text][data-clipped]'))`)
  const clipped = '[data-phase-task] [data-fade-text][data-clipped]'
  assert.equal(await text(`${clipped} [data-fade-text-more]`), '…')
  assert.match(await state.page.evaluate(`getComputedStyle(document.querySelector('${clipped} [data-fade-text-body]')).maskImage`), /linear-gradient/)
  assert.equal(await state.page.evaluate(`getComputedStyle(document.querySelector('${clipped} [data-fade-text-body]')).whiteSpace`), 'nowrap')
  assert.deepEqual(state.page.errors, [])
})

test('a task shows its refs as chips, and a chip opens its file at that line', { skip }, async () => {
  await openSpec()
  await click('[data-spec-tab="tasks"]')
  await state.page.until(`Boolean(document.querySelector('[data-phase-task="1.1"] [data-task-ref]'))`)
  assert.deepEqual(await state.page.evaluate(`[...document.querySelectorAll('[data-phase-task="1.1"] [data-task-ref]')].map((c) => c.dataset.taskRef)`), ['R1.1', '§D1'])
  assert.equal(await exists('[data-phase-task="1.3"] [data-task-refs]'), false, 'a task with no refs has no chips')
  // The title is shown without its refs.
  assert.equal(await text('[data-phase-task="1.1"] [data-fade-text-body]'), 'Add fixed-width integer types')
  // Requirement chip: the requirements tab, at criterion 1 of Requirement 1.
  await click('[data-phase-task="1.1"] [data-task-ref="R1.1"]')
  await state.page.until(`Boolean(document.querySelector('[data-spec-card="requirements.md"] [data-ref-target]'))`)
  assert.deepEqual(await selected(), ['requirements.md'])
  assert.match((await text('[data-spec-card="requirements.md"] [data-ref-target]')) ?? '', /A byte value SHALL hold 0 to 255/)
  // Design chip: the design tab, at the D1 heading.
  await click('[data-spec-tab="tasks"]')
  await state.page.until(`Boolean(document.querySelector('[data-phase-task="1.1"] [data-task-ref="§D1"]'))`)
  await click('[data-phase-task="1.1"] [data-task-ref="§D1"]')
  await state.page.until(`Boolean(document.querySelector('[data-spec-card="design.md"] [data-ref-target]'))`)
  assert.deepEqual(await selected(), ['design.md'])
  assert.match((await text('[data-spec-card="design.md"] [data-ref-target]')) ?? '', /D1\. Layout/)
  assert.deepEqual(state.page.errors, [])
})

test('Spec details reads like an about box: one tight row per section, small muted labels in one column, values at one edge', { skip }, async () => {
  await openSpec()
  await state.page.until(`Boolean(document.querySelector('[data-spec-details-box] [data-rail-section="Epic"]'))`)
  const got = await state.page.evaluate<{ labels: number; values: number; beside: boolean; label: (string | boolean)[]; epicHeight: number; linkRow: boolean }>(`(() => {
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
  assert.deepEqual(state.page.errors, [])
})

for (const [width, height] of [
  [1280, 900],
  [390, 844],
])
  test(`the spec tabs are a square, full-bleed tabbed heading at ${width}`, { skip }, async () => {
    await openSpec({ width, height })
    const got = await state.page.evaluate(`(() => {
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
    assert.deepEqual(state.page.errors, [])
  })

// The spec page's Summary and Task graph in a real Chrome (browser/harness.tsx
// &stored=1): the Summary holds the revision's facts; the Task graph draws
// this spec's tasks and edges; the task list stays reachable.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { harnessPage } from './browser/harness-page.ts'

const state = harnessPage('spec Summary')
const { skip } = state
const click = (selector: string) => state.page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const text = (selector: string) => state.page.evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`)
const exists = (selector: string) => state.page.evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)

async function openSpec(params: Record<string, string>, size = { width: 1280, height: 900 }) {
  await state.page.open(state.harness.url({ page: 'specs', stored: '1', ...params }), size)
  await state.page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await state.page.until(`Boolean(document.querySelector('[data-spec-summary-data]'))`)
}

test('the Summary shows the revision, state and folder, and opening reads no review', { skip }, async () => {
  await openSpec({})
  assert.match(await text('[data-spec-summary-data]'), /Revision 3 · c0ffee12c0ff · draft/)
  assert.match(await text('[data-spec-summary-data]'), /\.kiro\/specs\/byte-types\/ · requirements\.md/)
  assert.equal(
    (await state.page.evaluate<{ operation?: string }[]>('window.__harness.calls')).some((c) => /review/.test(c.operation ?? '')),
    false,
  )
  assert.deepEqual(state.page.errors, [])
})

for (const [width, height] of [
  [1280, 900],
  [390, 844],
])
  test(`the Overview shows the Frontier and the Tasks tab the whole tree and the list at ${width}`, { skip }, async () => {
    await openSpec({}, { width, height })
    await state.page.until(`Boolean(document.querySelector('[data-spec-graph] [data-frontier]'))`)
    // Frontier: 1.2 just unlocked (its blocker is done); 1.3 and 1.4 wait.
    assert.deepEqual(await state.page.evaluate(`[...document.querySelectorAll('[data-spec-graph] [data-frontier-row]')].map((r) => r.dataset.frontierRow)`), ['1.2', '1.3', '1.4'])
    assert.equal(await exists('[data-spec-graph-tab]'), false)
    assert.equal(await exists('[data-focus-tree]'), false)
    // Tasks: the spec's whole tree, its four tasks and its live edges, then the list.
    await click('[data-spec-tab="tasks"]')
    await state.page.until(`Boolean(document.querySelector('[data-spec-graph] [data-focus-tree="spec:byte-types"]'))`)
    assert.deepEqual(await state.page.evaluate(`[...document.querySelectorAll('[data-spec-graph] [data-tree-node]')].map((n) => n.dataset.treeNode).sort()`), [
      '1.1',
      '1.2',
      '1.3',
      '1.4',
    ])
    assert.match(await text('[data-spec-graph] [data-tree-stat]'), /4 nodes · 2 live edges/)
    assert.equal(await state.page.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true)
    assert.equal(await state.page.evaluate(`document.querySelectorAll('[data-phase-tasks] li').length`), 4)
    assert.deepEqual(state.page.errors, [])
  })

const { specGraphHref } = await import('../src/focus-tree.ts')
test('the spec graph links to the Graph tree on the app route only', () => {
  assert.equal(specGraphHref('/apps/avoozl', 'byte-types'), '/apps/avoozl?tree=spec%3Abyte-types')
  assert.equal(specGraphHref('/popout/apps/avoozl', 'byte-types'), null)
})

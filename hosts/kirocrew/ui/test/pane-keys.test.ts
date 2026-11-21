// The Specs page's keys in a real Chrome (browser/harness.tsx &stored=1):
// Home, End, Page Up and Page Down scroll the pane under the mouse, not the
// window, and leave a focused text box alone. Skipped when no Chrome.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { harnessPage } from './browser/harness-page.ts'

const state = harnessPage('Specs page keys')
const { skip } = state
const click = (selector: string) => state.page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)

async function openSpec(params = {}, size = { width: 1280, height: 800 }) {
  await state.page.open(state.harness.url({ page: 'specs', stored: '1', ...params }), size)
  await state.page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await state.page.until(`Boolean(document.querySelector('[data-spec-tab="overview"]'))`)
}

test('Page Down and End scroll the pane under the mouse, not the page, and skip a search box', { skip }, async () => {
  await openSpec({}, { width: 1280, height: 560 })
  await state.page.until(`Boolean(document.querySelector('[data-spec-details-box]'))`)
  // Fill the details box so it can scroll, and bring it into view.
  await state.page.evaluate(`document.querySelector('[data-spec-details-box]').style.maxHeight = '120px'`)
  await state.page.evaluate(
    `(() => { const body = document.querySelector('[data-spec-body]'), box = document.querySelector('[data-spec-details-box]'); body.scrollTop += box.getBoundingClientRect().top - body.getBoundingClientRect().top - 20 })()`,
  )
  const box = await state.page.evaluate<{ x: number; y: number }>(
    `(() => { const r = document.querySelector('[data-spec-details-box]').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 } })()`,
  )
  await state.page.evaluate(`document.activeElement?.blur()`)
  await state.page.hover(box.x, box.y)
  const tops = () =>
    state.page.evaluate<number[]>(
      `[document.querySelector('[data-spec-details-box]').scrollTop, document.querySelector('[data-spec-body]').scrollTop, document.scrollingElement.scrollTop]`,
    )
  const [, bodyBefore, winBefore] = await tops()
  await state.page.key('PageDown', 'PageDown', 34)
  const [details, body, win] = await tops()
  assert.ok(details > 0, 'the details box scrolled')
  assert.equal(body, bodyBefore, 'not the tab content')
  assert.equal(win, winBefore, 'not the page')
  await state.page.key('Home', 'Home', 36)
  assert.equal((await tops())[0], 0)
  // Over the list, End goes to its bottom.
  const list = await state.page.evaluate<{ x: number; y: number }>(
    `(() => { const r = document.querySelector('[data-list-pane="specs"]').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 200 } })()`,
  )
  await state.page.hover(list.x, list.y)
  await state.page.key('End', 'End', 35)
  const metrics = await state.page.evaluate<number[]>(
    `(() => { const el = document.querySelector('[data-list-pane="specs"]'); return [el.scrollTop, el.clientHeight, el.scrollHeight] })()`,
  )
  assert.ok(metrics[0] > 0 && Math.abs(metrics[0] + metrics[1] - metrics[2]) <= 1, JSON.stringify(metrics))
  // Typing in a text box keeps its own keys.
  await state.page.evaluate(`document.querySelector('[data-list-pane="specs"]').scrollTop = 0`)
  await state.page.evaluate(`document.querySelector('input[type="search"]')?.focus()`)
  await state.page.key('End', 'End', 35)
  assert.equal(await state.page.evaluate(`document.querySelector('[data-list-pane="specs"]').scrollTop`), 0)
})

// In a real Chrome, on the harness's full app shell (?page=app&delivery=1):
// Dashboards › Delivery draws every lane in one row on any window wider than
// a phone, beside the left nav and at 125% or 150% zoom of a 1280 px window
// (1024 and 853 CSS px), with no button outside its card and no sideways
// scroll. A phone (390 px) stacks the lanes, 1 per row. The nav filters put
// the task search under the Filters header. Skipped when no
// Chrome is found.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { harnessPage } from './browser/harness-page.ts'

const state = harnessPage('Delivery lane', { hostCss: process.env.AVOOZL_HOST_CSS })
const { skip } = state
// The phone breakpoint DeliveryView's useNarrow uses.
const PHONE = 767

async function openDelivery(width: number) {
  await state.page.open(state.harness.url({ page: 'app', delivery: '1', theme: 'light' }), { width, height: 800 })
  await state.page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width <= PHONE ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width <= PHONE) {
    await state.page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    await state.page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
  }
  await state.page.until(`Boolean(document.querySelector('${scope} [data-nav-group="delivery"]'))`)
  await state.page.evaluate(`document.querySelector('${scope} [data-nav-group="delivery"]').click()`)
  // On a phone the menu stays open on In flight's filters; shut it to see the state.page.
  if (width <= PHONE)
    await state.page.evaluate(`(() => { if (document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`)
  await state.page.until(`document.querySelectorAll('[data-lane-columns] > section').length > 0`, 30000)
  await state.page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
  return state.page.evaluate<{ board: number; columns: number; lanes: number; rows: number; outside: string[]; sideways: boolean }>(`(() => {
    const board = document.querySelector('[data-lane-columns]')
    const lanes = [...board.children]
    const tops = new Set(lanes.map((lane) => Math.round(lane.getBoundingClientRect().top)))
    // A button whose box leaves its card's box.
    const outside = [...board.querySelectorAll('[data-lane-card] button')].filter((button) => {
      const card = button.closest('[data-lane-card]').getBoundingClientRect(), r = button.getBoundingClientRect()
      return r.left < card.left - 0.5 || r.right > card.right + 0.5
    }).map((button) => button.getAttribute('aria-label') || button.textContent.trim())
    return {
      board: board.clientWidth,
      columns: Number(board.dataset.laneColumns),
      lanes: lanes.length,
      rows: tops.size,
      outside,
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })()`)
}

// 1440 and 1280: laptop windows; 1024 and 853: a 1280 window at 125% and
// 150% zoom; 768: the narrowest window above the phone breakpoint.
for (const width of [1440, 1280, 1024, Math.floor(1280 / 1.5), PHONE + 1])
  test(`Delivery at ${width} px: every lane in one row`, { skip }, async () => {
    const got = await openDelivery(width)
    assert.equal(got.columns, got.lanes, `one column per lane: ${JSON.stringify(got)}`)
    assert.equal(got.columns, 4)
    assert.equal(got.rows, 1, 'the lanes share one row')
    assert.deepEqual(got.outside, [], 'no button leaves its card')
    assert.equal(got.sideways, false, 'no sideways scroll')
  })

test('Delivery at 390 px (a phone): 1 lane per row', { skip }, async () => {
  const got = await openDelivery(390)
  assert.equal(got.columns, 1)
  assert.equal(got.rows, got.lanes, 'each lane on its own row')
  assert.equal(got.sideways, false, 'no sideways scroll')
})

test("Delivery's nav filters: the task search sits under the Filters header, above All states", { skip }, async () => {
  await openDelivery(1280)
  const got = await state.page.evaluate(`(() => {
    const rail = document.querySelector('[data-left-nav] [data-nav-filters="avoozl-delivery"]')
    const block = rail.querySelector('[data-rail-section="filters"]')
    const head = block.querySelector('[data-rail-head]')
    const search = rail.querySelector('input[type="search"]')
    const all = block.querySelector('[data-rail-state=""]')
    const after = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    return {
      inBlock: block.contains(search),
      afterHead: after(head, search),
      beforeAll: after(search, all),
      below: search.getBoundingClientRect().top >= head.getBoundingClientRect().bottom,
    }
  })()`)
  assert.deepEqual(got, { inBlock: true, afterHead: true, beforeAll: true, below: true })
})

test('Delivery entries are cards edged in the lane color, on a lane with the app background', { skip }, async () => {
  for (const width of [1280, 390]) {
    await openDelivery(width)
    const got = await state.page.evaluate<
      { background: string; line: string; dot: string | null; entries: { left: string; others: string[]; pad: number[]; radius: number }[] }[]
    >(`(() => {
      const lanes = [...document.querySelectorAll('[data-lane-columns] > section')]
      return lanes.map((lane) => {
        const probe = document.createElement('i')
        probe.style.color = getComputedStyle(lane).getPropertyValue('--lane-line')
        lane.append(probe)
        const line = getComputedStyle(probe).color
        probe.remove()
        const dot = lane.querySelector('[data-lane-dot]')
        const entries = [...lane.querySelectorAll('[data-lane-card]')].map((li) => {
          const s = getComputedStyle(li)
          return {
            left: s.borderLeftWidth + ' ' + s.borderLeftColor,
            others: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth],
            pad: [s.paddingTop, s.paddingLeft].map(parseFloat),
            radius: parseFloat(s.borderTopRightRadius),
          }
        })
        return { background: getComputedStyle(lane).backgroundColor, line, dot: dot && getComputedStyle(dot).backgroundColor, entries }
      })
    })()`)
    const pageBg = await state.page.evaluate(`getComputedStyle(document.body).backgroundColor`)
    assert.ok(
      got.some((lane) => lane.entries.length),
      'some lane has entries',
    )
    for (const lane of got) {
      assert.equal(lane.background, pageBg, `lane background is the app background at ${width}`)
      assert.equal(lane.dot, lane.line, 'the heading dot is the lane color')
      for (const entry of lane.entries) {
        assert.equal(entry.left, `3px ${lane.line}`, 'left edge is the lane color')
        assert.deepEqual(entry.others, ['1px', '1px', '1px'], 'a hairline on the other sides')
        assert.ok(
          entry.pad.every((p) => p >= 6),
          `padded inside: ${entry.pad}`,
        )
        assert.ok(entry.radius > 0, 'rounded corners')
      }
    }
  }
})

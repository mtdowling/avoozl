// In a real Chrome, on the harness's full app shell (?page=app&delivery=1):
// Dashboards › Delivery draws every lane in one row on any window wider than
// a phone, beside the left nav and at 125% or 150% zoom of a 1280 px window
// (1024 and 853 CSS px), with no button outside its card and no sideways
// scroll. A phone (390 px) stacks the lanes, 1 per row. The nav filters put
// the task search under the Filters header. Skipped when no
// Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Delivery lane tests'
// The phone breakpoint DeliveryView's useNarrow uses.
const PHONE = 767

let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

async function openDelivery(width) {
  await page.open(harness.url({ page: 'app', delivery: '1', theme: 'light' }), { width, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width <= PHONE ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width <= PHONE) {
    await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    await page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
  }
  await page.evaluate(`(() => { const h = document.querySelector('${scope} [data-nav-head][data-nav-group="dashboard"]'); if (h && !h.hasAttribute('data-open')) h.click(); return true })()`)
  await page.until(`Boolean(document.querySelector('${scope} [data-nav-item="dashboard/delivery"]'))`)
  await page.evaluate(`document.querySelector('${scope} [data-nav-item="dashboard/delivery"]').click()`)
  await page.until(`document.querySelectorAll('[data-lane-columns] > section').length > 0`, 30000)
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
  return page.evaluate(`(() => {
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
  const got = await page.evaluate(`(() => {
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

test('Delivery entries have only a top rule in the lane color, on a lane with the app background', { skip }, async () => {
  for (const width of [1280, 390]) {
    await openDelivery(width)
    const got = await page.evaluate(`(() => {
      const lanes = [...document.querySelectorAll('[data-lane-columns] > section')]
      return lanes.map((lane) => {
        const probe = document.createElement('i')
        probe.style.color = getComputedStyle(lane).getPropertyValue('--lane-line')
        lane.append(probe)
        const line = getComputedStyle(probe).color
        probe.remove()
        const entries = [...lane.querySelectorAll('[data-lane-card]')].map((li) => {
          const s = getComputedStyle(li)
          return { top: s.borderTopWidth + ' ' + s.borderTopColor, others: [s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth], padX: [s.paddingLeft, s.paddingRight] }
        })
        return { background: getComputedStyle(lane).backgroundColor, line, entries }
      })
    })()`)
    const pageBg = await page.evaluate(`getComputedStyle(document.body).backgroundColor`)
    assert.ok(got.some((lane) => lane.entries.length), 'some lane has entries')
    for (const lane of got) {
      assert.equal(lane.background, pageBg, `lane background is the app background at ${width}`)
      for (const entry of lane.entries) {
        assert.deepEqual(entry.others, ['0px', '0px', '0px'], 'no side or bottom border')
        assert.equal(entry.top, `1px ${lane.line}`, 'top border is the lane color')
        assert.deepEqual(entry.padX, ['0px', '0px'], 'no side padding')
      }
    }
  }
})

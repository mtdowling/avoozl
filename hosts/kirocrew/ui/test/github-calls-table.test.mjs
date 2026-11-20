// Settings › GitHub › GitHub calls (harness ?page=github-usage): a real table
// sorted most calls first, each header sorting both ways by click and by
// keyboard, with aria-sort on the sorted column and numbers right-aligned.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the GitHub calls table tests'

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

const READ = `(() => {
  const table = document.querySelector('table[data-github-usage]')
  return {
    order: [...table.querySelectorAll('tbody tr')].map((tr) => tr.dataset.usageSource),
    sort: Object.fromEntries([...table.querySelectorAll('th')].map((th) => [th.querySelector('[data-sort]').dataset.sort, th.getAttribute('aria-sort')])),
    align: [...table.querySelector('tbody tr').children].map((td) => getComputedStyle(td).textAlign),
  }
})()`
const click = (key) => page.evaluate(`document.querySelector('[data-sort="${key}"]').click()`)

test('the table starts most calls first, and a header click sorts both ways', { skip }, async () => {
  await page.open(harness.url({ page: 'github-usage' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('table[data-github-usage] tbody tr'))`)
  let m = await page.evaluate(READ)
  assert.deepEqual(m.order, ['tick', 'crew', 'view', 'review', 'setup'])
  assert.deepEqual(m.sort, { source: 'none', calls: 'descending', notModified: 'none', cached: 'none' })
  assert.deepEqual(
    m.align.map((a) => (a === 'start' ? 'left' : a)),
    ['left', 'right', 'right', 'right'],
  )
  await click('calls')
  m = await page.evaluate(READ)
  assert.deepEqual(m.order, ['setup', 'review', 'view', 'crew', 'tick'])
  assert.equal(m.sort.calls, 'ascending')
  await click('source')
  m = await page.evaluate(READ)
  assert.deepEqual(m.order, ['crew', 'review', 'setup', 'tick', 'view'])
  assert.deepEqual(m.sort, { source: 'ascending', calls: 'none', notModified: 'none', cached: 'none' })
})

test('Enter and Space on a focused header sort it', { skip }, async () => {
  await page.open(harness.url({ page: 'github-usage' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('table[data-github-usage] tbody tr'))`)
  await page.evaluate(`document.querySelector('[data-sort="cached"]').focus()`)
  await page.key('Enter', 'Enter', 13, '\r')
  let m = await page.evaluate(READ)
  assert.equal(m.sort.cached, 'descending')
  assert.deepEqual(m.order.slice(0, 2), ['view', 'review'])
  await page.key(' ', 'Space', 32, ' ')
  m = await page.evaluate(READ)
  assert.equal(m.sort.cached, 'ascending')
  assert.equal(m.order.at(-1), 'view')
})

// Every row of both tables (by source, by login) shares one column grid:
// each column's cells have the same left edge and width in every row,
// header included, and a long login cuts off with its full name as a title.
const GRID = `(() => {
  const rows = [...document.querySelectorAll('table[data-github-usage] tr')]
  return {
    edges: rows.map((tr) => [...tr.children].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)] })),
    heights: [...document.querySelectorAll('tr[data-usage-source]')].map((tr) => Math.round(tr.getBoundingClientRect().height)),
    scroll: (() => { const box = document.querySelector('table[data-github-usage]').parentElement; return [box.scrollWidth, box.clientWidth] })(),
    long: [...document.querySelectorAll('tr[data-usage-source] td:first-child')].map((td) => [td.title, td.scrollWidth > td.clientWidth]),
    numbers: [...document.querySelectorAll('tr[data-usage-source] td:not(:first-child)')].map((td) => getComputedStyle(td).fontVariantNumeric),
  }
})()`

for (const width of [1280, 320])
  test(`at ${width} px every column has one left edge and width across rows and tables`, { skip }, async () => {
    await page.open(harness.url({ page: 'github-usage' }), { width, height: 800 })
    await page.until(`document.querySelectorAll('table[data-github-usage]').length === 2`)
    const m = await page.evaluate(GRID)
    assert.ok(m.edges.length >= 9, 'both tables render their rows')
    for (const row of m.edges) assert.deepEqual(row, m.edges[0])
    // No cell wraps, so every body row is one line high.
    assert.ok(Math.max(...m.heights) - Math.min(...m.heights) <= 1, String(m.heights))
    assert.ok(m.numbers.every((v) => v.includes('tabular-nums')))
    const long = m.long.find(([title]) => title.startsWith('avoozl-machine-server'))
    assert.ok(long, 'the long login has its full name as a title')
    // At phone width the table scrolls sideways inside its box instead of squeezing.
    if (width === 320) assert.ok(m.scroll[0] > m.scroll[1])
  })

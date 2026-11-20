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

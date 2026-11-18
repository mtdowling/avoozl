// A list column's filters are one line at every width: compact fields with
// no labels above them, the less-used filters behind one small filter icon,
// and the status text (the count, Refresh) at the right end of the same
// line. Needs you and Specs use it. In a real Chrome at 390 and 1280 px,
// light and dark, on the harness page; skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('Needs you shows its count once, at the right end of the filter row', () => {
  const view = source('ConflictsView.tsx')
  assert.equal(view.match(/\{matching\.length\} of \{items\.length\}/g).length, 1)
  assert.match(view, /shown\.length < matching\.length \? `\$\{shown\.length\} shown of \$\{matching\.length\}` : ''/)
  assert.match(view, /key: 'q'[^\n]*primary: true/)
  assert.match(view, /key: 'kind'[^\n]*primary: true/)
  assert.match(source('PlansView.tsx'), /<PlanFilters[^>]*>\s*<Hint size="xs" role="status">/)
  const panel = source('FilterPanel.tsx')
  assert.match(panel, /data-filter-row css-flex-wrap="nowrap" flex minW0 items="center" gap="1\.5"/)
  assert.match(panel, /<MoreMenu label=\{`More filters/)
  assert.match(panel, /<Box css-flex-shrink="0" css-white-space="nowrap" ml="auto" flex items="center" gap="1\.5" data-filter-status>/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the filter row test'
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

for (const width of [390, 1280])
  for (const theme of ['light', 'dark'])
    test(`the filter row is one line, its buttons at most 28 px, its status at the right end, at ${width} px ${theme}`, { skip }, async () => {
      await page.open(harness.url({ modal: 'filter-row', theme }), { width, height: 800, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-filter-row]'))`)
      const got = await page.evaluate(`(() => {
        const row = document.querySelector('[data-filter-row]'), box = row.getBoundingClientRect()
        const kids = [...row.children].map((el) => el.getBoundingClientRect())
        const status = row.querySelector('[data-filter-status]').getBoundingClientRect()
        const controls = [...row.querySelectorAll('button, input, select')].map((el) => Math.round(el.getBoundingClientRect().height))
        return {
          height: Math.round(box.height),
          oneLine: kids.every((k) => Math.abs(k.top + k.height / 2 - (box.top + box.height / 2)) < 4),
          statusRight: Math.round(box.right - status.right),
          controls,
          labels: row.querySelectorAll('label > span, legend').length,
          sideways: row.scrollWidth > row.clientWidth + 1,
        }
      })()`)
      assert.ok(got.height <= 28, `one line tall (${got.height} px)`)
      assert.equal(got.oneLine, true, 'every part on the same line')
      assert.ok(got.statusRight <= 1, `the status text ends the line (${got.statusRight} px short)`)
      assert.ok(got.controls.every((h) => h <= 28), `controls ${got.controls}`)
      assert.equal(got.labels, 0, 'no labels stacked above the fields')
      assert.equal(got.sideways, false, 'nothing spills out of the row')
      // The less-used filters open from the filter icon, and the row stays one line.
      await page.evaluate(`document.querySelector('[data-filter-more] [data-more-button]').click()`)
      await page.until(`Boolean(document.querySelector('[data-more-panel] select'))`)
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-more-panel] select').length`), 4)
      assert.ok((await page.evaluate(`document.querySelector('[data-filter-row]').getBoundingClientRect().height`)) <= 28)
    })

for (const width of [390, 1280])
  test(`Needs you shows its count exactly once, at the right end of the filter line, at ${width} px`, { skip }, async () => {
    await page.open(harness.url({ page: 'needs' }), { width, height: 800 })
    await page.until(`Boolean(document.querySelector('[data-filter-panel="avoozl-conflicts"][data-filter-row]'))`)
    const got = await page.evaluate(`(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
      const has = (el) => /\\b4 of 4\\b/.test(el.textContent)
      // The smallest elements that read 4 of 4 (React splits the numbers into their own text nodes).
      const counts = [...document.querySelectorAll('body *')].filter((el) => visible(el) && has(el) && ![...el.children].some(has))
      const row = document.querySelector('[data-filter-row]')
      return { n: counts.length, inStatus: counts.every((el) => el.closest('[data-filter-status]')), rowHeight: Math.round(row.getBoundingClientRect().height) }
    })()`)
    assert.equal(got.n, 1, 'one "4 of 4" on the page')
    assert.equal(got.inStatus, true, 'it is the filter line\'s status text')
    assert.ok(got.rowHeight <= 28, `the filter line is one line (${got.rowHeight} px)`)
  })

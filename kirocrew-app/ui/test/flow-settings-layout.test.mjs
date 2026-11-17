// Settings › Flow in the app shell (harness ?page=app&flow=1): every label
// keeps a gap before its "(optional)" marker, fields side by side line up,
// Group by is a segmented control (no native dropdown), and Save sits last
// in a footer that stays in view. The harness's own small stylesheet is used
// on purpose: the gaps must not depend on the host's utility classes.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Settings › Flow layout tests'

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

const wait = (ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const click = (selector, text) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`

async function openFlowSettings(width) {
  await page.open(harness.url({ page: 'app', radar: '1', flow: '1' }), { width, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(200)
  assert.ok(await page.evaluate(click(`${scope} [data-nav-head]`, 'Settings')))
  await wait(200)
  if (width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await page.evaluate(click(`${scope} [data-nav-item]`, 'Flow'))
  if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(300)
  assert.ok(await page.evaluate(click('button', 'Configure flow')), 'Configure flow')
  await page.until(`Boolean(document.querySelector('[data-flow-settings] [data-flow-footer]'))`)
}

const READ = `(() => {
  const root = document.querySelector('[data-flow-settings]')
  const r = (el) => el.getBoundingClientRect()
  // Each label text and the "(optional)" marker after it, on one row.
  const gaps = [...root.querySelectorAll('[data-marker]')].map((marker) => {
    const text = marker.previousElementSibling
    const a = r(text), b = r(marker)
    return { label: text.textContent.trim(), gap: Math.abs(a.top - b.top) < 4 ? b.left - a.right : null }
  })
  // Fields of one grid that share a row: their inputs start at one height.
  const rows = [...root.querySelectorAll('[data-flow-group]')].map((grid) => {
    const fields = [...grid.querySelectorAll(':scope > [data-flow-field]')].map((f) => ({ top: Math.round(r(f).top), label: Math.round(r(f.children[0]).top), input: Math.round(r(f.children[1]).top), key: Math.round(r(f.children[3]).top) }))
    const byRow = {}
    for (const f of fields) (byRow[f.top] ||= []).push(f)
    return { group: grid.dataset.flowGroup, rows: Object.values(byRow).map((list) => ({ labels: [...new Set(list.map((f) => f.label))].length, inputs: [...new Set(list.map((f) => f.input))].length, keys: [...new Set(list.map((f) => f.key))].length })) }
  })
  const footer = root.querySelector('[data-flow-footer]'), body = footer.closest('[data-modal-body]')
  const buttons = [...footer.querySelectorAll('button')]
  return {
    gaps,
    rows,
    selects: root.querySelectorAll('select').length,
    groupBy: Boolean(root.querySelector('[aria-label="Group by"]')),
    footerInView: r(footer).bottom <= r(body).bottom + 1,
    lastButton: buttons.at(-1)?.textContent.trim(),
    lastPrimary: buttons.at(-1)?.hasAttribute('data-primary'),
  }
})()`

for (const width of [390, 1280])
  test(`Settings › Flow keeps gaps, aligned fields and a Save footer at ${width} px`, { skip }, async () => {
    await openFlowSettings(width)
    const before = await page.evaluate(READ)
    assert.ok(before.gaps.length >= 8, `found ${before.gaps.length} labels`)
    for (const { label, gap } of before.gaps) if (gap !== null) assert.ok(gap >= 4, `"${label}" runs into (optional): ${gap}px`)
    for (const { group, rows } of before.rows)
      for (const row of rows) {
        assert.equal(row.labels, 1, `${group}: labels in one row start at different heights`)
        assert.equal(row.inputs, 1, `${group}: inputs in one row start at different heights`)
        assert.equal(row.keys, 1, `${group}: .avoozl.json keys in one row sit at different heights`)
      }
    assert.equal(before.selects, 0, 'no native dropdown')
    assert.ok(before.groupBy, 'Group by is a segmented control')
    assert.equal(before.lastButton, 'Save')
    assert.ok(before.lastPrimary, 'Save is the primary button')
    assert.ok(before.footerInView, 'the footer is in view before scrolling')
    await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-modal-body]')].at(-1); b.scrollTop = b.scrollHeight / 2; return true })()`)
    await wait(100)
    assert.ok((await page.evaluate(READ)).footerInView, 'the footer stays in view while the groups scroll')
  })

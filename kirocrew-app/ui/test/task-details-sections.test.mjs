// Task details show every section at once: each a bordered, titled box
// whose header button folds it (aria-expanded; Enter and Space work), all
// open at first. The source check runs anywhere; the page check runs in a
// real Chrome (AVOOZL_CHROME, or an installed one) and is skipped without.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('every drawer section is a SectionBox, open at first, with no fold or tab left', () => {
  const drawer = source('TaskDrawer.tsx')
  const keys = [...drawer.matchAll(/\{ key: '(\w+)', label: '[^']+' \}/g)].map((m) => m[1])
  assert.ok(keys.length >= 10, 'the section list')
  for (const key of keys) assert.match(drawer, new RegExp(`<SectionBox id="${key}" title=`), key)
  assert.doesNotMatch(drawer, /<Fold\b|<details\b|SegmentedControl|role="tab/)
  // Opening one never closes another, and none starts closed.
  assert.doesNotMatch(drawer, /<SectionBox[^>]*open=\{/)
  const controls = source('controls.tsx')
  const box = controls.slice(controls.indexOf('export function SectionBox'), controls.indexOf('// A row of picture-less radio cards'))
  assert.match(box, /useState\(props\.open \?\? true\)/)
  assert.match(box, /<Card className=/)
  assert.match(box, /<button\s+type="button"\s+aria-expanded=\{open\}\s+aria-controls=\{body\}/)
  assert.match(box, /hidden=\{!open\}/)
  assert.doesNotMatch(box, /warning|yellow|#[0-9a-f]{3,6}/i)
})

test('every place that opens task details uses the one drawer', () => {
  for (const name of ['GraphView.tsx', 'PlansView.tsx', 'DashboardView.tsx', 'ConflictsView.tsx', 'FlowView.tsx', 'ActivityView.tsx', 'LanesView.tsx', 'FocusTree.tsx'])
    assert.match(source(name), /drawer\.openTask\(/, name)
  // Only the drawer and Needs you's history read a task's detail.
  for (const name of ['GraphView.tsx', 'PlansView.tsx', 'DashboardView.tsx', 'FlowView.tsx', 'TraceView.tsx']) assert.doesNotMatch(source(name), /tasks\.detail\(/, name)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the task details page test'
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

const BOXES = `[...document.querySelectorAll('[data-section-box]')].map((box) => {
  const button = box.querySelector('h3 > button[aria-expanded]')
  const body = button && document.getElementById(button.getAttribute('aria-controls'))
  return { id: box.dataset.sectionBox, title: button?.textContent.trim() ?? '', expanded: button?.getAttribute('aria-expanded'), hidden: body ? body.hidden : null }
})`

test('page: each section shows a header and folds by click and by keyboard (Space)', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light' }), { width: 1280, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`document.querySelectorAll('[data-section-box]').length >= 9`)
  const boxes = await page.evaluate(BOXES)
  for (const id of ['summary', 'description', 'links', 'notes', 'delivery', 'timing', 'evidence', 'conflicts', 'timeline']) {
    const box = boxes.find((b) => b.id === id)
    assert.ok(box, `${id} is shown`)
    assert.ok(box.title, `${id} has a header`)
    assert.equal(box.expanded, 'true', `${id} starts open`)
    assert.equal(box.hidden, false, `${id} body shows`)
  }
  for (const { id } of boxes) {
    const sel = JSON.stringify(`[data-section-toggle="${id}"]`)
    await page.evaluate(`document.querySelector(${sel}).click()`)
    await page.until(`document.querySelector(${sel}).getAttribute('aria-expanded') === 'false'`)
    const now = await page.evaluate(BOXES)
    assert.equal(now.find((b) => b.id === id).hidden, true, `${id} body hides`)
    // The others stay open.
    assert.ok(now.filter((b) => b.id !== id).every((b) => b.expanded === 'true'), `${id} closed another box`)
    await page.evaluate(`document.querySelector(${sel}).focus()`)
    await page.key(' ', 'Space', 32)
    await page.until(`document.querySelector(${sel}).getAttribute('aria-expanded') === 'true'`)
  }
  assert.deepEqual(page.errors, [])
})

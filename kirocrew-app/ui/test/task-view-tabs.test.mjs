// Task details are a tabbed page (the shared bar of Tabs.tsx) with a cached AI
// summary on Overview. The logic checks run anywhere; the page checks run in
// a real Chrome (AVOOZL_CHROME) and are skipped without one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { readTab, tabKey, tabLink } from '../src/tabs.ts'
import { TASK_TAB_KEYS, TASK_TAB_PARAM, tabHasData } from '../src/task-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('the open tab is kept in the address, and arrow keys move between the tabs', () => {
  assert.deepEqual(TASK_TAB_KEYS, ['overview', 'timeline', 'links', 'work', 'review', 'details'])
  assert.equal(tabLink(TASK_TAB_PARAM, 'work'), '?task-tab=work')
  assert.equal(readTab('?task-tab=work', TASK_TAB_PARAM, TASK_TAB_KEYS), 'work')
  assert.equal(readTab('?task-tab=nope', TASK_TAB_PARAM, TASK_TAB_KEYS), null)
  assert.equal(readTab('', TASK_TAB_PARAM, TASK_TAB_KEYS), null)
  assert.equal(tabKey('ArrowRight', TASK_TAB_KEYS, 'overview'), 'timeline')
  assert.equal(tabKey('ArrowLeft', TASK_TAB_KEYS, 'overview'), 'details')
  // The drawer uses the shared bar and the shared address hook.
  const drawer = source('TaskDrawer.tsx')
  assert.match(drawer, /useTabParam<TaskTab>\(TASK_TAB_PARAM/)
  assert.match(drawer, /<Tabs id="task-tabs"/)
  // An old Trace link opens the Timeline tab.
  assert.match(source('OldTraceLink.tsx'), /openTask\(task\.id, 'timeline'\)/)
})

test('a tab with nothing to show is not rendered; Overview, Links and Details always have content', () => {
  const detail = (extra = {}) => ({ steps: [], timeline: [], delivery: null, task: {}, ...extra })
  assert.equal(tabHasData('timeline', detail(), 0), false)
  assert.equal(tabHasData('timeline', detail({ timeline: [{ at: 'x', text: 'y' }] }), 0), true)
  assert.equal(tabHasData('timeline', detail({ timing: { spans: [] } }), 0), true)
  assert.equal(tabHasData('work', detail(), 0), false)
  assert.equal(tabHasData('work', detail({ delivery: { sessions: [] } }), 0), true)
  assert.equal(tabHasData('review', detail(), 0), false)
  assert.equal(tabHasData('review', detail(), 2), true)
  assert.equal(tabHasData('review', detail({ task: { handSetReview: true } }), 0), true)
  for (const tab of ['overview', 'links', 'details']) assert.equal(tabHasData(tab, detail(), 0), true, tab)
  const drawer = source('TaskDrawer.tsx')
  assert.match(drawer, /TASK_TABS\.filter\(\(t\) => tabHasData\(t\.key, detail, runs\)\)/)
  assert.doesNotMatch(drawer, /data-tab-empty|const EMPTY/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the task tabs page test'
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

const open = async (summary, width = 1280) => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light', summary }), { width, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`Boolean(document.querySelector('[data-tabs="task-tabs"]'))`)
}
const asks = () => page.evaluate(`window.__harness.calls.filter((c) => c.operation === 'task.summary.request').map((c) => c.input)`)

test('page: tabs switch by click and arrow keys, and a tab with no data is not rendered', { skip }, async () => {
  await open('ready')
  assert.equal(await page.evaluate(`document.querySelector('[data-tab-panel]').dataset.tabPanel`), 'overview')
  // The harness task has no delivery and no review: Work and Review are gone.
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-tabs="task-tabs"] [role=tab]')].map((t) => t.textContent.trim())`), ['Overview', 'Timeline', 'Links', 'Details'])
  await page.evaluate(`document.querySelector('[data-tab="overview"]').focus()`)
  await page.key('ArrowRight', 'ArrowRight', 39)
  await page.until(`document.querySelector('[data-tab-panel]').dataset.tabPanel === 'timeline'`)
  assert.equal(await page.evaluate(`document.querySelector('[data-tab="timeline"]').getAttribute('aria-selected')`), 'true')
  assert.equal(await page.evaluate(`document.querySelector('[data-tab-empty]')`), null)
  assert.deepEqual(page.errors, [])
})

test('page: an address naming a hidden tab opens Overview', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light', summary: 'ready' }) + '&task-tab=work', { width: 1280, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`Boolean(document.querySelector('[data-tab-panel]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-tab-panel]').dataset.tabPanel`), 'overview')
  assert.equal(await page.evaluate(`document.querySelector('[data-tab="work"]')`), null)
  assert.equal(await page.evaluate(`document.querySelector('[data-tab="overview"]').getAttribute('aria-selected')`), 'true')
  assert.deepEqual(page.errors, [])
})

test('page: the summary shows the working box, then the text; the same inputs ask once and never again', { skip }, async () => {
  await open('none')
  await page.until(`Boolean(document.querySelector('[data-review-working]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-task-summary] [data-plan-review-state]').textContent`), 'AI working')
  // The data is there while it works.
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-section-box="summary"]'))`), true)
  await page.until(`Boolean(document.querySelector('[data-task-summary-text]'))`, 15000)
  assert.equal(await page.evaluate(`document.querySelector('[data-review-working]')`), null)
  assert.match(await page.evaluate(`document.querySelector('[data-task-summary-text]').textContent`), /last gate before cutover/)
  assert.equal((await asks()).length, 2, 'one ask, one read of the same answer')
  // Reopening with a summary already written asks for nothing.
  await open('ready')
  await page.until(`Boolean(document.querySelector('[data-task-summary-text]'))`)
  assert.deepEqual(await asks(), [])
})

test('page: a failed summary is a muted line with Retry, and the view still works', { skip }, async () => {
  await open('failed')
  await page.until(`Boolean(document.querySelector('[data-task-summary-fallback]'))`)
  assert.match(await page.evaluate(`document.querySelector('[data-task-summary-fallback]').textContent`), /Summary unavailable/)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-section-box="summary"]'))`), true)
  await page.evaluate(`document.querySelector('[data-task-summary-retry]').click()`)
  await page.until(`Boolean(document.querySelector('[data-review-working]'))`)
  assert.deepEqual((await asks()).map((a) => a.retry), [true])
})

test('page: on a phone the tab bar scrolls sideways', { skip }, async () => {
  await open('ready', 390)
  const bar = await page.evaluate(`getComputedStyle(document.querySelector('[data-tabs="task-tabs"]')).overflowX`)
  assert.equal(bar, 'auto')
  assert.deepEqual(page.errors, [])
})

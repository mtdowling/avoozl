// Trace is gone (Requirement 106): task details hold the Timeline of Avoozl's
// task steps, old trace links land somewhere real, and nothing new calls
// GitHub. The page check runs in a real Chrome (AVOOZL_CHROME) and is skipped
// without one.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { TABS, parseTraceLink, redirectTab, taskForIssue } from '../src/nav-api.ts'
import { afterPrevious, clock } from '../src/task-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('there is no Trace nav entry, page, drawer or Done list', () => {
  assert.ok(!TABS.some((t) => t.key === 'trace' || t.label === 'Trace'))
  for (const name of ['TraceView.tsx', 'TraceDone.tsx', 'trace-api.ts']) assert.equal(existsSync(new URL(`../src/${name}`, import.meta.url)), false, name)
  for (const name of ['App.tsx', 'DashboardView.tsx', 'RadarFlightGroups.tsx']) assert.doesNotMatch(source(name), /Trace(View|Drawer|Page)|onTrace|radar\.trace|trace\.done/, name)
})

test('an old trace page link opens Delivery', () => {
  assert.deepEqual(redirectTab('trace'), { tab: 'delivery' })
})

test('an old ?trace link names an issue, and the task that owns it opens', () => {
  assert.deepEqual(parseTraceLink('?trace=acme%2Frecipe-box%2352'), { repository: 'acme/recipe-box', number: 52 })
  assert.equal(parseTraceLink('?trace=nope'), null)
  assert.equal(parseTraceLink(''), null)
  const graph = {
    tasks: [
      { id: 'a', repository: 'recipe-box', issue: { number: 52, repository: 'acme/recipe-box' } },
      { id: 'b', repository: 'acme/other', issue: { number: 52, repository: null } },
      { id: 'c', repository: 'x', issue: null },
    ],
  }
  assert.equal(taskForIssue(graph, { repository: 'acme/recipe-box', number: 52 })?.id, 'a')
  assert.equal(taskForIssue(graph, { repository: 'acme/other', number: 52 })?.id, 'b')
  assert.equal(taskForIssue(graph, { repository: 'acme/recipe-box', number: 53 }), undefined)
  // The link is read once and sent through Delivery; a missing task stays there.
  const app = source('App.tsx')
  assert.match(app, /<OldTraceLink /)
  assert.match(app, /go\(\{ tab: 'delivery', focus: null, drill: null \}\)/)
  // It reads the stored graph and nothing from GitHub.
  assert.match(source('OldTraceLink.tsx'), /views\.graph\(/)
  assert.doesNotMatch(source('OldTraceLink.tsx'), /radar\./)
})

test('the Timeline reads the steps task.detail gives, with a wait since the step before', () => {
  assert.match(source('TaskDrawer.tsx'), /<SectionBox id="timeline" title="Timeline">\s*\{detail\.steps\?\.length \? <TaskSteps steps=\{detail\.steps\} \/> : null\}/)
  const steps = [
    { label: 'Spec approved', at: '2026-11-13T08:00:00Z' },
    { label: 'Ready', at: null },
    { label: 'Started (attempt 1)', at: '2026-11-13T08:10:00Z' },
    { label: 'Landed', at: '2026-11-13T11:10:00Z' },
  ]
  assert.equal(afterPrevious(steps, 0), null)
  assert.equal(afterPrevious(steps, 2), '10 min after Spec approved')
  assert.equal(afterPrevious(steps, 3), '3 h after Started (attempt 1)')
  assert.equal(clock('2026-11-13T08:10:00Z'), 'Fri 08:10 UTC')
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Timeline page test'
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

test('page: the Timeline box is open and lists the steps, a failed attempt, a skipped step and builds', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light' }), { width: 1280, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`document.querySelectorAll('[data-task-step]').length > 0`)
  const rows = await page.evaluate(
    `[...document.querySelectorAll('[data-task-step]')].map((li) => [li.dataset.taskStep, li.dataset.state, li.querySelector('[data-step-time]').textContent, li.textContent])`,
  )
  assert.deepEqual(
    rows.map(([key, state, time]) => [key, state, time]),
    [
      ['spec', 'done', 'Fri 08:00 UTC'],
      ['ready', 'skipped', 'Skipped'],
      ['started-1', 'done', 'Fri 08:10 UTC'],
      ['failed-1', 'done', 'Fri 08:40 UTC'],
      ['started-2', 'done', 'Fri 09:00 UTC'],
      ['checks', 'done', 'Fri 09:30 UTC'],
      ['landed', 'done', 'Fri 09:35 UTC'],
      ['builds', 'done', 'Fri 09:32 UTC'],
      ['integrated', 'now', 'In progress'],
    ],
  )
  assert.match(rows[3][3], /Attempt 1 failed.*30 min after Started \(attempt 1\).*tests red/)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-step-build="failed"]').length`), 1)
  assert.equal(await page.evaluate(`document.querySelector('[data-section-toggle="timeline"]').getAttribute('aria-expanded')`), 'true')
  assert.deepEqual(page.errors, [])
})

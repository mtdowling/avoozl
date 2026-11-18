// The Retros pill (Retros and Proposals pages, linked both ways) and Flow's
// nav filters, in the real app shell in a real Chrome; the sort and chip
// logic is checked without one. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { FLOW_ORDER, flowChoices, sortTasks } from '../src/flow-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

const task = (taskId, repository, plan, startedAt, leadMs, stage) => ({ taskId, repository, plan, epic: null, startedAt, leadMs, stages: { [stage]: leadMs } })
const tasks = [task('a.2', 'r/one', 'a', '2026-11-02', 30, 'coding'), task('a.10', 'r/one', 'a', '2026-11-03', 10, 'tests'), task('b.1', 'r/two', 'b', '2026-11-01', 20, 'coding')]

test('Time per task sorts by newest, lead time or task, in either direction, and leaves its input alone', () => {
  const ids = (order) => sortTasks(tasks, order).map((t) => t.taskId)
  assert.deepEqual(ids(FLOW_ORDER), ['a.10', 'a.2', 'b.1'])
  assert.deepEqual(ids({ sort: 'recent', dir: 'asc' }), ['b.1', 'a.2', 'a.10'])
  assert.deepEqual(ids({ sort: 'lead', dir: 'desc' }), ['a.2', 'b.1', 'a.10'])
  assert.deepEqual(ids({ sort: 'task', dir: 'asc' }), ['a.2', 'a.10', 'b.1'])
  assert.deepEqual(tasks.map((t) => t.taskId), ['a.2', 'a.10', 'b.1'])
})

test('chips count the tasks that carry each value, from the unfiltered read', () => {
  const base = { tasks, repositories: ['r/one', 'r/two', 'r/none'], epics: [], plans: [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }], stages: ['coding', 'tests'] }
  const got = flowChoices(base)
  assert.deepEqual(got.repositories.map((c) => [c.value, c.count]), [['r/one', 2], ['r/two', 1], ['r/none', 0]])
  assert.deepEqual(got.plans.map((c) => [c.label, c.count]), [['Alpha', 2], ['Beta', 1]])
  assert.deepEqual(got.stages.map((c) => [c.value, c.count]), [['coding', 2], ['tests', 1]])
})

test('Flow keeps its charts and draws its filters as nav rows and chips, with no dropdowns', () => {
  const flow = source('FlowView.tsx'), rail = source('FlowRail.tsx')
  assert.match(rail, /<NavSlotFor section="flow">\s*<div role="search" aria-label="Filter flow timing" data-nav-filters="avoozl-flow" data-filter-panel="avoozl-flow"/)
  assert.match(rail, /<RailSortList/)
  assert.match(rail, /<RailChips id="repositories"[\s\S]*<RailChips id="plans"[\s\S]*<RailChips id="stages"[\s\S]*<RailChips id="epics"/)
  assert.doesNotMatch(rail + flow, /<select|<FilterPanel|FilterSelect/)
  assert.match(flow, /<FlowCharts view=\{view\} unit=\{unit\} onUnit=\{setUnit\} \/>/)
  assert.match(source('App.tsx'), /t\.key === 'flow'/)
})

test('the Retros pill sits after Flow, lists two pages, and an old Flow link goes there', () => {
  const app = source('App.tsx')
  assert.match(app, /retros: RETROS_PAGES/)
  assert.match(app, /<RetrosView\s+workspaceId=\{active\}/)
  assert.match(app, /'retros-page'/)
  assert.doesNotMatch(source('FlowView.tsx'), /Retros\b.*SectionHeading|tab: FlowTab/)
})

const chrome = findChrome(), skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Retros pill test'
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
const wait = (ms = 300) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const count = (selector) => page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
const text = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
const open = async () => {
  await page.open(harness.url({ page: 'app', retros: '1' }), { width: 1280, height: 900, dark: false })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
}

test('Retros is a nav pill after Flow with Retros and Proposals pages, linked both ways', { skip }, async () => {
  await open()
  const order = await page.evaluate(`[...document.querySelectorAll('[data-left-nav] [data-nav-section]')].map((s) => s.dataset.navSection)`)
  assert.equal(order.indexOf('retros'), order.indexOf('flow') + 1, order.join())
  await click('[data-left-nav] [data-nav-group="retros"]')
  await page.until(`Boolean(document.querySelector('[data-nav-item="retros/proposals"]'))`)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-nav-children="retros"] [data-nav-item]')].map((b) => b.textContent)`), ['Retros', 'Proposals'])
  // Retros: newest first, each with its scope, time and model and its proposals.
  await page.until(`document.querySelectorAll('[data-retro]').length === 4`)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-retro]')].map((r) => r.dataset.retro)`), ['retro-4', 'retro-3', 'retro-2', 'retro-1'])
  const facts = await text('[data-retro="retro-2"] [data-retro-facts]')
  assert.match(facts, /Scope\s*acme\/recipe-box/)
  assert.match(facts, /Model\s*claude-sonnet/)
  assert.match(await text('[data-retro="retro-1"] [data-retro-facts]'), /Model\s*not recorded/)
  assert.equal(await count('[data-retro="retro-2"] [data-retro-proposal]'), 2)
  // A proposal link opens that proposal on the Proposals page, marked.
  await click('[data-retro-proposal="retro-2:p2"] button')
  await page.until(`Boolean(document.querySelector('[data-proposal="retro-2:p2"][data-linked]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-nav-item="retros/proposals"]').dataset.selected !== undefined`), true)
  assert.ok(await count('[data-proposal-retro]') >= 3)
  assert.match(await text('[data-proposal="retro-2:p2"]'), /Reject[\s\S]*Approve/)
  // And back: the proposal's retro link opens its retro, marked.
  await click('[data-proposal="retro-1:p1"] [data-proposal-retro]')
  await page.until(`Boolean(document.querySelector('[data-retro="retro-1"][data-linked]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-nav-item="retros/retros"]').dataset.selected !== undefined`), true)
  // Flow no longer has them.
  await click('[data-left-nav] [data-nav-group="flow"]')
  await page.until(`Boolean(document.querySelector('[data-flow-cards]'))`)
  assert.equal(await count('[data-retro], [data-flow-proposals]'), 0)
})

test('Flow nav filters change the charts, and By week still works', { skip }, async () => {
  await open()
  await click('[data-left-nav] [data-nav-group="flow"]')
  await page.until(`document.querySelectorAll('[data-flow-bar]').length === 3`)
  const rail = '[data-nav-filters="avoozl-flow"]'
  assert.equal(await count(`${rail} select`), 0, 'no dropdowns')
  assert.ok((await count(`${rail} [data-rail-sort]`)) === 3 && (await count(`${rail} [data-rail-chip]`)) >= 4)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${rail} [data-rail-head]')].map((h) => h.textContent.trim())`).then((x) => x.slice(0, 3)), ['Sort', 'Filters', 'Repositories'])
  const bars = () => page.evaluate(`[...document.querySelectorAll('[data-flow-bar]')].map((b) => b.dataset.flowBar)`)
  const points = () => page.evaluate(`document.querySelectorAll('[data-flow-charts] circle').length`)
  const before = await points()
  // A repository chip with its count narrows bars, charts and cards.
  assert.equal(await page.evaluate(`document.querySelector('${rail} [data-rail-chip="acme/recipe-box"]').getAttribute('aria-label')`), 'acme/recipe-box, 2')
  await click(`${rail} [data-rail-chip="acme/pantry"]`)
  await page.until(`document.querySelectorAll('[data-flow-bar]').length === 1`)
  assert.deepEqual(await bars(), ['pantry.1'])
  assert.ok((await points()) < before, 'the charts follow the pick')
  assert.equal(await page.evaluate(`document.querySelector('${rail} [data-rail-chip="acme/pantry"]').getAttribute('aria-pressed')`), 'true')
  // The other chips stay, so a second pick is possible; Clear resets.
  assert.equal(await count(`${rail} [data-rail-chip]`) >= 4, true)
  await click(`${rail} [data-rail-icon]:not([aria-label])`)
  await page.until(`document.querySelectorAll('[data-flow-bar]').length === 3`)
  // A stage row, then a spec chip.
  await click(`${rail} [data-rail-chip="review"]`)
  await page.until(`document.querySelectorAll('[data-flow-bar]').length === 1`)
  assert.deepEqual(await bars(), ['pantry.1'])
  await click(`${rail} [data-rail-chip="review"]`)
  await click(`${rail} [data-rail-chip="search"]`)
  await page.until(`document.querySelectorAll('[data-flow-bar]').length === 2`)
  // Sort reorders the list in place; By week stays.
  await click(`${rail} [data-rail-sort="lead"]`)
  assert.deepEqual(await bars(), ['search.4', 'search.3'])
  await click(`[role="radio"]:not([aria-checked="true"])`)
  assert.equal(await page.evaluate(`document.querySelector('[role="radiogroup"] [aria-checked="true"]').textContent`), 'By week')
})

test('Retros show why a retro failed, link its chat, and offer Run again; an old retro says none was recorded', { skip }, async () => {
  await open()
  await click('[data-left-nav] [data-nav-group="retros"]')
  await page.until(`document.querySelectorAll('[data-retro]').length === 4`)
  assert.equal(await page.evaluate(`document.querySelector('[data-retro="retro-3"] [data-retro-failed]').dataset.retroFailed`), 'lost')
  assert.match(await text('[data-retro="retro-3"] [data-retro-failed]'), /the chat was lost: Kiro Crew no longer lists it \(waited 11 minutes\)[\s\S]*Run again/)
  assert.equal(await page.evaluate(`document.querySelector('[data-retro="retro-3"] [data-retro-chat] a').getAttribute('href')`), '/chat?sid=avoozl_retro_3')
  assert.match(await text('[data-retro="retro-2"] [data-retro-chat]'), /Open chat/)
  // A process retro shows its log tail and the attach command.
  assert.match(await text('[data-retro="retro-4"] [data-retro-log]'), /the model call was cut off/)
  assert.ok(await count('[data-retro="retro-4"] [data-copy-attach]'))
  assert.equal((await text('[data-retro="retro-1"] [data-retro-chat]')).trim(), 'No chat was recorded for this retro.')
  assert.equal(await count('[data-retro="retro-2"] [data-retro-failed]'), 0)
})

test('Activity links owner/repo#N of a GitHub item to GitHub in a new tab', { skip }, async () => {
  await page.open(harness.url({ page: 'app', radar: '1', activity: '1', ghitems: '1' }), { width: 1280, height: 900, dark: false })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  await wait(1200)
  await page.evaluate(`[...document.querySelectorAll('[data-left-nav] [data-nav-head]')].find((x) => x.textContent.includes('Activity')).click()`)
  await page.until(`document.querySelectorAll('[data-activity-item]').length >= 2`)
  const links = await page.evaluate(`[...document.querySelectorAll('[data-activity-item]')].slice(0, 2).map((a) => [a.textContent, a.href, a.target, a.rel])`)
  assert.deepEqual(links.sort(), [
    ['nupp-lang/bar#7', 'https://github.com/nupp-lang/bar/issues/7', '_blank', 'noopener noreferrer'],
    ['nupp-lang/foo#12', 'https://github.com/nupp-lang/foo/pull/12', '_blank', 'noopener noreferrer'],
  ])
})

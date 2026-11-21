// The Insights home (simplify §D13): its strip, chart shapes and empty words,
// then the real view in Chrome (harness ?page=app): the page opens on it,
// with data and empty, and a saved retro opens in the reader.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TABS } from '../src/nav-api.ts'
import { runSeed } from '../src/chat-api.ts'
import { EMPTY, barRects, burndownPaths, niceMax, stripItems } from '../src/insights-api.ts'
import { harnessPage } from './browser/harness-page.ts'

test('Insights is first in the nav, and the page opens on it', async () => {
  assert.deepEqual(
    TABS.map((t) => t.label),
    ['Insights', 'Specs', 'Graph', 'In flight', 'Needs you', 'Activity', 'Settings'],
  )
  const app = (await import('node:fs')).readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /useState<Tab>\('insights'\)/)
})

test('the strip links each number to its view', () => {
  const items = stripItems({ needsYou: 2, inFlight: 1, ready: 4, main: { state: 'stopped', repositories: [] }, loop: false })
  assert.deepEqual(
    items.map((i) => [i.label, i.value, i.tab, i.tone]),
    [
      ['Needs you', '2', 'waiting', 'warn'],
      ['In flight', '1', 'delivery', 'muted'],
      ['Ready', '4', 'graph', 'muted'],
      ['Main', 'line stopped', 'delivery', 'danger'],
      ['Autopilot', 'off', 'settings', 'muted'],
    ],
  )
  assert.equal(items[4].settingsTab, 'delivery')
})

test('charts scale to a round maximum, and a burndown steps between commits', () => {
  assert.deepEqual([0, 1, 3, 7, 12, 60].map(niceMax), [1, 1, 5, 10, 20, 100])
  const { max, bars } = barRects([0, 5, 10])
  assert.equal(max, 10)
  assert.equal(bars[0].height, 0)
  assert.ok(bars[2].height > bars[1].height && bars[2].y < bars[1].y)
  const paths = burndownPaths([
    { at: '2026-11-01T00:00:00Z', open: 4, done: 0 },
    { at: '2026-11-11T00:00:00Z', open: 2, done: 2 },
  ])
  assert.match(paths.open, /^M4\.0,\d+\.\dH316\.0V\d+\.\d$/)
  assert.equal(EMPTY.finished, 'No finished tasks in this range yet.')
})

test('Run a retro seeds the avoozl-retro skill with the scope and range', () => {
  assert.equal(
    runSeed({ kind: 'retro', scope: 'meal-planner', days: 30 }),
    'Use the avoozl-retro skill to run a retro over `meal-planner` for the last 30 days. Save the report with retro.save and change nothing else.',
  )
})

const shell = harnessPage('Insights view')

test('the page opens on Insights with every chart, and a retro opens in the reader', { skip: shell.skip }, async () => {
  const { page, harness } = shell
  await page.open(harness.url({ page: 'app', insights: 'full' }), { width: 1280, height: 900 })
  await page.until(`document.querySelectorAll('[data-strip-item]').length === 5`, 30000)
  assert.match(await page.evaluate(`document.querySelector('[data-strip-item="needs-you"]').textContent`), /Needs you3/)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-insights-chart]')].map((c) => c.dataset.insightsChart)`), [
    'burndown',
    'finished',
    'lead-time',
    'stages',
    'review',
    'rework',
  ])
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-insights-empty]').length`), 0)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-burndown]').length`), 2)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-retro]')].map((r) => r.dataset.retro)`), [
    '2026-11-21-0930-meal-planner.md',
    '2026-11-14-1615-workspace.md',
  ])
  await page.evaluate(`document.querySelector('[data-retro]').click()`)
  await page.until(`Boolean(document.querySelector('[data-document-reader]'))`)
  assert.match(await page.evaluate(`document.querySelector('[data-document-reader]').textContent`), /Biggest slowdown/)
})

test('an empty workspace says what each chart is missing', { skip: shell.skip }, async () => {
  const { page, harness } = shell
  await page.open(harness.url({ page: 'app' }), { width: 320, height: 800 })
  await page.until(`document.querySelectorAll('[data-insights-empty]').length === 7`, 30000)
  const words = await page.evaluate<string[]>(`[...document.querySelectorAll('[data-insights-empty]')].map((e) => e.textContent)`)
  assert.ok(words.includes('No finished tasks in this range yet.'))
  assert.ok(words.some((w) => w.startsWith('No saved retros yet.')))
  // Nothing is wider than the phone.
  assert.ok(await page.evaluate(`document.documentElement.scrollWidth <= 320`))
})

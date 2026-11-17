import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { toFlowForm, toFlowSection, pdcaText } from '../src/flow-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

test('CI settings validate all four limits and preserve read-only class overrides on save', () => {
  const form = toFlowForm({ ci: { windowDays: 14, docsOnlyMinutes: 90, waitShare: 0.5, minPullRequests: 8, classes: { docs: ['guides/'] } } })
  assert.deepEqual(toFlowSection(form), { flow: { ci: { windowDays: 14, docsOnlyMinutes: 90, waitShare: 0.5, minPullRequests: 8, classes: { docs: ['guides/'] } } } })
  assert.deepEqual(toFlowSection(toFlowForm()), { flow: {} })
  for (const [key, values] of Object.entries({ windowDays: ['0', '91', '1.5'], docsOnlyMinutes: ['0', '100001', '1.5'], waitShare: ['0.04', '1.01', 'NaN'], minPullRequests: ['0', '1001', '1.5'] }))
    for (const value of values) assert.ok(toFlowSection({ ...form, [key]: value }).error, `${key} refuses ${value}`)
})

test('CI PDCA explains an unmeasured baseline without implying that tasks are being counted', () => {
  const proposal = { status: 'approved', metric: 'CI minutes per pull request', pdca: { before: null, window: 5, pendingReason: 'Need 5 closed docs pull requests before approval to compare CI minutes.' } }
  assert.equal(pdcaText(proposal), `PDCA: ${proposal.pdca.pendingReason}`)
  assert.equal(pdcaText({ ...proposal, status: 'open' }), null)
  assert.equal(pdcaText({ ...proposal, pdca: { before: 25, after: 10, result: 'helped', window: 5 } }), 'PDCA: CI minutes per pull request 25 min → 10 min, helped.')
  assert.equal(pdcaText({ ...proposal, pdca: { before: 25, window: 5 } }), 'PDCA: measuring over the next 5 closed pull requests.')
  assert.equal(pdcaText({ ...proposal, metric: 'lead time', pdca: { before: 25, window: 5 } }), 'PDCA: measuring over the next 5 tasks.')
})

const chrome = findChrome(), skip = chrome ? false : 'no Chrome found'
let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({ entry: fileURLToPath(new URL('./browser/ci-flow.tsx', import.meta.url)) })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => { await browser?.close(); harness?.remove() })
const fill = (id, value) => page.evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
const save = () => page.evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent === 'Save').click()`)

for (const width of [390, 1280]) for (const theme of ['light', 'dark'])
  test(`CI card shows class bars, task/other minutes, wait limit and repeat runs at ${width} ${theme}`, { skip }, async () => {
    await page.open(harness.url({ screen: 'flow', theme }), { width, height: 900, dark: theme === 'dark' })
    await page.until(`Boolean(document.querySelector('[data-ci-repository]'))`)
    const text = await page.evaluate(`document.querySelector('[data-flow-ci]').textContent`)
    for (const value of ['example/recipe-box', '45 task', '15 other min', '55% of lead time', 'limit 40%', '.github/workflows/test.yml', '2 commits with repeats', '3 extra runs', '75 extra min']) assert.ok(text.includes(value), value)
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-ci-class] [role="img"]').length`), 6)
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
    assert.deepEqual(page.errors, [])
  })

test('CI empty state names the absent pull request read', { skip }, async () => {
  await page.open(harness.url({ screen: 'flow', empty: '1' }), { width: 390, height: 900 })
  await page.until(`document.querySelector('[data-flow-ci]')?.textContent.includes('No pull requests read')`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-ci-repository]').length`), 0)
})

test('CI settings save validated limits without changing read-only globs, and refuse an invalid share', { skip }, async () => {
  await page.open(harness.url({ screen: 'settings' }), { width: 390, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-ci-settings]'))`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-ci-settings] input').length`), 4)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-ci-globs] input, [data-ci-globs] textarea, [data-ci-globs] select').length`), 0)
  assert.match(await page.evaluate(`document.querySelector('[data-ci-globs]').textContent`), /docs\/.*\*\*\/\*\.md/)
  await fill('avoozl-flow-ci-wait', '1.01')
  await save()
  await page.until(`document.querySelector('[role="alert"]')?.textContent.includes('CI wait share')`)
  assert.deepEqual(await page.evaluate('window.__ciCalls'), [])
  for (const [id, value] of [['window', '14'], ['docs', '90'], ['wait', '0.5'], ['min', '8']]) await fill(`avoozl-flow-ci-${id}`, value)
  await save()
  await page.until('window.__ciCalls.length === 1')
  const [call] = await page.evaluate('window.__ciCalls')
  assert.equal(call.operation, 'flow.settings.update')
  assert.deepEqual(call.input.flow.ci, { windowDays: 14, docsOnlyMinutes: 90, waitShare: 0.5, minPullRequests: 8, classes: { docs: ['docs/', '**/*.md'] } })
  assert.equal(call.input.expectedHash, 'fixture-hash')
  assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  assert.deepEqual(page.errors, [])
})

test('a delayed settings response cannot save the previous workspace CI form into the new workspace', { skip }, async () => {
  await page.open(harness.url({ screen: 'settings-workspace' }), { width: 1280, height: 900 })
  await page.until(`typeof window.__finishCiFirst === 'function'`)
  await page.evaluate(`window.__setCiWorkspace('second')`)
  await page.until(`document.getElementById('avoozl-flow-ci-window')?.value === '21'`)
  await page.evaluate(`window.__finishCiFirst()`)
  await page.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  assert.equal(await page.evaluate(`document.getElementById('avoozl-flow-ci-window').value`), '21')
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-save-footer]'))`), false, 'the late reply did not make the form look changed')
  await fill('avoozl-flow-ci-window', '22')
  await page.until(`Boolean(document.querySelector('[data-save-footer]'))`)
  await save()
  await page.until('window.__ciCalls.length === 1')
  const [call] = await page.evaluate('window.__ciCalls')
  assert.equal(call.workspaceId, 'second')
  assert.equal(call.input.expectedHash, 'fixture-hash', 'both workspaces deliberately share the same hash')
  assert.deepEqual(call.input.flow.ci, { windowDays: 22, classes: { docs: ['second-guides/'] } })
  assert.deepEqual(page.errors, [])
})

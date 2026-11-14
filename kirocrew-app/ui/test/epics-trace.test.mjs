// The Epics screen and Trace's Done work in a real Chrome: the harness's own
// answers for the empty and full cases, and the real sample (demo mode) for
// the data the backend gives. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the epics and trace test'

let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({
    scripts: { 'demo.js': demoScript(await demoReplies()) },
  })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const button = (text, role) => `[...document.querySelectorAll('button${role ? `[role="${role}"]` : ''}')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
const radio = (name, key) => `document.querySelector('input[name="${name}"][value="${key}"]')`
const open = (query) =>
  page.open(harness.url({ page: 'app', ...query }), {
    width: 1280,
    height: 800,
  })
const specsTab = button('Specs', 'tab')

test('no epics: it says what an epic is and offers Plan an epic', { skip }, async () => {
  await open({ epics: 'empty' })
  await page.until(`Boolean(${specsTab})`)
  await click(specsTab)
  await page.until(`Boolean(document.querySelector('[data-epics-empty]'))`)
  const text = await page.evaluate(`document.querySelector('[data-epics-empty]').textContent`)
  assert.match(text, /No epics yet/)
  assert.match(text, /fits in one pull request is not an epic/)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-epics-empty] [data-plan-epic]'))`), true)
  assert.deepEqual(page.errors, [])
})

test('an epic opens to specs and phases; one epic and one spec are open at a time', { skip }, async () => {
  await open({ epics: 'full' })
  await page.until(`Boolean(${specsTab})`)
  await click(specsTab)
  await page.until(`Boolean(${radio('epics-open', 'search-v2')})`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-epics-view] [data-radio-fold="epics-open"] > [data-radio-section][data-open="true"]').length`), 0)
  await click(radio('epics-open', 'search-v2'))
  await page.until(`Boolean(document.querySelector('[data-epic-phases="search-v2"]'))`)
  const rows = await page.evaluate(
    `[...document.querySelectorAll('[data-epic-phases="search-v2"] [data-epic-phase]')].map((r) => [r.dataset.gate, ...[...r.querySelectorAll('td')].filter((c, i) => i !== 1 && i < 4).map((c) => c.textContent.trim())])`,
  )
  assert.deepEqual(rows, [
    ['passed', 'Index', '3 of 3 released', 'none'],
    ['open', 'Ranking', '1 of 4 released', '3 wait on #52 (CI)'],
    ['closed', 'Cache', '0 of 5 released', 'Phase Ranking waits for phase Index to merge.'],
  ])
  // Opening the second spec closes the first.
  await click(radio('epic-search-v2', 'search-docs'))
  await page.until(`Boolean(document.querySelector('[data-epic-phases="search-docs"]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-epic-phases="search-v2"]'))`), false)
  // Not on GitHub yet, and the Issue Radar link with what to do there.
  assert.match(await page.evaluate(`document.querySelector('[data-unprojected="notes"]').textContent`), /Draft spec\. Not approved/)
  assert.equal(await page.evaluate(`document.querySelector('[data-radar-graph] a').getAttribute('href')`), '/issue-radar')
  assert.match(await page.evaluate(`document.querySelector('[data-radar-graph]').textContent`), /Choose the Graph view there/)
  assert.deepEqual(page.errors, [])
})

test('a phase Graph button opens the Graph, and Back returns to the epics', { skip }, async () => {
  await open({ epics: 'full' })
  await page.until(`Boolean(${specsTab})`)
  await click(specsTab)
  await page.until(`Boolean(${radio('epics-open', 'search-v2')})`)
  await click(radio('epics-open', 'search-v2'))
  await page.until(`Boolean(document.querySelector('[aria-label="Graph of phase Ranking"]'))`)
  await click(`document.querySelector('[aria-label="Graph of phase Ranking"]')`)
  await page.until(`document.querySelector('[aria-label="Avoozl views"] [aria-selected="true"]')?.textContent.trim().startsWith('Graph')`)
  await page.evaluate(`document.querySelector('[data-avoozl-pane]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true, bubbles: true }))`)
  await page.until(`document.querySelector('[aria-label="Avoozl views"] [aria-selected="true"]')?.textContent.trim().startsWith('Specs')`)
})

test('Trace with no issue chosen lists the merges with who did them and links', { skip }, async () => {
  await page.open(harness.url({ page: 'trace', done: 'full' }), {
    width: 1280,
    height: 800,
  })
  await page.until(`Boolean(document.querySelector('[data-done-row="S4"]'))`)
  const rows = await page.evaluate(
    `[...document.querySelectorAll('[data-done-row]')].map((r) => [r.dataset.doneRow, r.querySelector('[data-done-who]').textContent, r.querySelector('[data-done-time]').textContent, [...r.querySelectorAll('a')].map((a) => a.getAttribute('href'))])`,
  )
  assert.deepEqual(rows, [
    ['S4', 'Radar crew Draco', 'Merged Mon 11:40 UTC', ['https://github.com/acme/recipe-box/pull/57', 'https://github.com/acme/recipe-box/issues/52']],
    ['S1', 'No crew found on the issue', 'Merged Sun 10:00 UTC', ['https://github.com/acme/recipe-box/pull/41', 'https://github.com/acme/recipe-box/issues/40']],
  ])
  await click(`document.querySelector('[aria-label="Trace of Index builder"]')`)
  await page.until(`document.querySelector('[data-picked]').textContent === 'acme/recipe-box#52'`)
  assert.deepEqual(page.errors, [])
})

test('Trace with nothing merged says what to do, with a button', { skip }, async () => {
  await page.open(harness.url({ page: 'trace', done: 'empty' }), {
    width: 1280,
    height: 800,
  })
  await page.until(`Boolean(document.querySelector('[data-done-empty]'))`)
  assert.match(await page.evaluate(`document.querySelector('[data-done-empty]').textContent`), /Nothing has merged yet/)
  await click(button('Open Epics'))
  await page.until(`document.querySelector('[data-picked]').textContent === 'epics'`)
})

test('the real sample fills both: gates, held reasons, the crews that merged', { skip }, async () => {
  await page.open(harness.url({ page: 'demo' }), {
    width: 1280,
    height: 800,
  })
  await page.until(`Boolean(${button('Start demo')})`)
  await click(button('Start demo'))
  await page.until(`Boolean(document.querySelector('[data-demo-tour]'))`)
  await click(button('Close the tour'))
  await click(specsTab)
  await page.until(`Boolean(${radio('epics-open', 'recipe-box')})`)
  await click(radio('epics-open', 'recipe-box'))
  await page.until(`Boolean(document.querySelector('[data-epic-phases="recipe-import"]'))`)
  const gates = await page.evaluate(`[...document.querySelectorAll('[data-epic-phases="recipe-import"] [data-epic-phase]')].map((r) => r.dataset.gate)`)
  assert.deepEqual(gates, ['passed', 'open'])
  assert.match(
    await page.evaluate(
      `document.querySelector('[data-epic-phases="recipe-import"] [data-epic-held]:last-of-type, [data-epic-phases="recipe-import"] tbody tr:last-child [data-epic-held]').textContent`,
    ),
    /Waiting on recipe-import\.2\.1/,
  )
  assert.match(await page.evaluate(`document.querySelector('[data-unprojected="pantry-photos"]').textContent`), /Draft spec/)
  assert.deepEqual(page.errors, [])
})

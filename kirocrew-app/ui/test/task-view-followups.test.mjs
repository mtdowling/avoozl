// Task details follow-ups: an empty section is not rendered, a task's
// source is a folding snippet of its own lines and 3 either side, and Edges
// (Waits on, Blocks) are bulleted lists of linked tasks, as in the Graph's
// item modal. The source checks run anywhere; the page checks run in a real
// Chrome (AVOOZL_CHROME) and are skipped without one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('one shared snippet header and one shared task list', () => {
  const fold = source('SnippetFold.tsx')
  assert.match(fold, /export function SnippetHeader/)
  assert.match(fold, /<button\s+type="button"\s+aria-expanded=\{props\.open\}\s+aria-controls=\{props\.controls\}/)
  assert.match(fold, /className="ml-auto flex-none">\{props\.action\}/)
  const list = source('TaskLinkList.tsx')
  assert.match(list, /if \(!props\.items\.length\) return null/)
  assert.match(list, /<ul className=\{`m-0 flex list-disc/)
  // The drawer and the Graph's item modal both use it.
  assert.match(source('TaskDrawer.tsx'), /<TaskLinkList/)
  assert.match(source('FocusTree.tsx'), /<TaskLinkList/)
  assert.doesNotMatch(source('FocusTree.tsx'), /: 'nothing'/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the task view page test'
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

const open = async (extra = {}) => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light', summary: 'ready', ...extra }), { width: 1280, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`Boolean(document.querySelector('[data-section-box="summary"]'))`)
}

test('page: Edges are bulleted lists, one linked task per item, and a task with none has no Edges box', { skip }, async () => {
  await open()
  const lists = await page.evaluate(`[...document.querySelectorAll('[data-section-box="links"] [data-task-list]')].map((box) => {
    const ul = box.querySelector('ul')
    return { name: box.dataset.taskList, list: ul.classList.contains('list-disc'), items: [...ul.children].map((li) => [li.tagName, li.querySelectorAll('button').length, li.querySelector('button').textContent]) }
  })`)
  assert.deepEqual(lists, [
    { name: 'Waits on', list: true, items: [['LI', 1, 'Protocol tests']] },
    { name: 'Blocks', list: true, items: [['LI', 1, 'Cutover']] },
  ])
  await open({ edges: 'none' })
  assert.equal(await page.evaluate(`document.querySelector('[data-section-box="links"]')`), null)
  assert.equal(await page.evaluate(`document.body.textContent.includes('Nothing.')`), false)
  assert.deepEqual(page.errors, [])
})

test('page: the source shows only nearby lines, its header folds it, and Open full file opens the whole file', { skip }, async () => {
  await open()
  await page.evaluate(`document.querySelector('[data-tab="details"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-origin-reader] [data-excerpt-lines]'))`)
  const shown = await page.evaluate(`({
    lines: [...document.querySelectorAll('[data-origin-reader] [data-line-number]')].map((row) => Number(row.dataset.lineNumber)),
    cited: [...document.querySelectorAll('[data-origin-reader] [data-cited="true"]')].map((row) => Number(row.dataset.lineNumber)),
    title: document.querySelector('[data-origin-reader] [data-excerpt-range]').textContent,
    buttons: [...document.querySelectorAll('[data-origin] button')].map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()),
  })`)
  assert.deepEqual(shown.lines, [17, 18, 19, 20, 21, 22, 23, 24])
  assert.deepEqual(shown.cited, [20, 21])
  assert.equal(shown.title, '.kiro/specs/sdk-rewrite/tasks.md, lines 20–21')
  // One Open full file (the icon button) and no Hide or Read.
  assert.equal(shown.buttons.filter((b) => b === 'Open full file').length, 1)
  assert.equal(shown.buttons.some((b) => /^(Hide|Read)\b/.test(b)), false)
  // The header's arrow and title are one button that folds the snippet.
  const toggle = `document.querySelector('[data-origin-reader] [data-snippet-toggle]')`
  const body = `document.getElementById(${toggle}.getAttribute('aria-controls'))`
  assert.equal(await page.evaluate(`${toggle}.getAttribute('aria-expanded')`), 'true')
  await page.evaluate(`${toggle}.click()`)
  await page.until(`${toggle}.getAttribute('aria-expanded') === 'false' && ${body}.hidden`)
  await page.evaluate(`${toggle}.click()`)
  await page.until(`${toggle}.getAttribute('aria-expanded') === 'true' && !${body}.hidden`)
  // Open full file shows the whole file in the reader.
  await page.evaluate(`document.querySelector('[data-origin-reader] [aria-label="Open full file"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-modal="avoozl-reader"]')) && document.querySelector('[data-modal="avoozl-reader"]').textContent.includes('Earlier task 40')`)
  assert.equal(await page.evaluate(`document.querySelector('[data-modal="avoozl-reader"]').textContent.includes('2. Earlier task 2')`), true)
  assert.deepEqual(page.errors, [])
})

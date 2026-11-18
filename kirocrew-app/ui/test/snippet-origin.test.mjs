// The task's source is a snippet: its own lines and 3 either side, a header
// that shows and hides it, and Open full file on the right of that header.
// The page checks run in a real Chrome (AVOOZL_CHROME) and are skipped without.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { sourceExcerpt } from '../src/task-api.ts'

test('the snippet is the task lines and 3 either side', () => {
  const text = Array.from({ length: 40 }, (_, i) => `l${i + 1}`).join('\n')
  const rows = sourceExcerpt(text, { lineStart: 20, lineEnd: 21 }, 3)
  assert.deepEqual(rows.map((r) => r.number), [17, 18, 19, 20, 21, 22, 23, 24])
  assert.deepEqual(rows.filter((r) => r.hit).map((r) => r.number), [20, 21])
})

test('the header is the shared SnippetBox: one toggle button, the action beside it', () => {
  const box = readFileSync(new URL('../src/SnippetBox.tsx', import.meta.url), 'utf8')
  assert.match(box, /aria-expanded=\{open\}/)
  assert.match(box, /aria-controls=\{body\}/)
  assert.match(box, /ml="auto"/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the snippet page test'
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

test('page: the snippet shows only nearby lines, the header toggles it, Open full file opens the whole file', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light' }), { width: 1280, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.evaluate(`(async () => { await new Promise((r) => setTimeout(r, 0)) })()`)
  await page.until(`Boolean(document.querySelector('[data-tab="details"]'))`)
  await page.evaluate(`document.querySelector('[data-tab="details"]').click()`)
  await page.until(`document.querySelectorAll('[data-origin-reader] [data-snippet-line]').length > 0`)
  const lines = `[...document.querySelectorAll('[data-origin-reader] [data-snippet-line]')].map((li) => Number(li.dataset.snippetLine))`
  assert.deepEqual(await page.evaluate(lines), [17, 18, 19, 20, 21, 22, 23, 24])
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-snippet-line][data-hit]')].map((li) => li.dataset.snippetLine)`), ['20', '21'])
  assert.equal(await page.evaluate(`document.body.textContent.includes('Spec line 40')`), false, 'not the whole file')
  assert.equal(await page.evaluate(`document.body.textContent.includes('Spec line 1\\u0000')`), false)
  // Gone: the old Read, Hide and a second Open full file.
  assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-task-modal] button')].filter((b) => /^(Hide|Read)\\b/.test(b.textContent.trim())).length`), 0)
  assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-task-modal] button')].filter((b) => b.textContent.trim() === 'Open full file').length`), 1)
  // The header title toggles it, by click and by keyboard.
  const toggle = `document.querySelector('[data-origin-reader] [data-snippet-toggle]')`
  assert.equal(await page.evaluate(`${toggle}.getAttribute('aria-expanded')`), 'true')
  await page.evaluate(`${toggle}.click()`)
  await page.until(`${toggle}.getAttribute('aria-expanded') === 'false' && !document.querySelector('[data-snippet-line]')`)
  await page.evaluate(`${toggle}.focus()`)
  await page.key(' ', 'Space', 32)
  await page.until(`${toggle}.getAttribute('aria-expanded') === 'true' && Boolean(document.querySelector('[data-snippet-line]'))`)
  // Open full file sits in the header, right of the title, and opens the whole file.
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-origin-reader] > div button:not([data-snippet-toggle])'))`), true)
  assert.equal(await page.evaluate(`document.querySelector('[data-document-reader]')`), null)
  await page.evaluate(`[...document.querySelectorAll('[data-origin-reader] button')].find((b) => b.textContent.trim() === 'Open full file').click()`)
  await page.until(`Boolean(document.querySelector('[data-document-reader]')) && document.querySelector('[data-document-reader]').textContent.includes('Spec line 40')`)
  assert.deepEqual(page.errors, [])
})

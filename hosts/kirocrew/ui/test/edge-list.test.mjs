// Waits on and Blocks are bulleted lists from one shared part (EdgeList), one
// task per item, each a link; an empty list is not drawn. The page check runs
// in a real Chrome (AVOOZL_CHROME) and is skipped without one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('every Waits on and Blocks list uses the shared EdgeList, with no inline or comma list left', () => {
  const list = source('EdgeList.tsx')
  assert.match(list, /if \(props\.items\.length === 0\) return null/)
  assert.match(list, /<Box as="ul" css-list-style="disc"/)
  assert.match(list, /<li key=\{item\.id\}/)
  for (const name of ['TaskDrawer.tsx', 'GraphView.tsx', 'FocusTree.tsx']) {
    const text = source(name)
    assert.match(text, /<EdgeList /, name)
    assert.doesNotMatch(text, /\{i > 0 && ', '\}\s*(<button[^>]*onSelect|\{link\(e\.)/, name)
    assert.doesNotMatch(text, /: 'nothing'/, name)
  }
  // An empty list is not drawn: the rows sit behind a length check.
  assert.match(source('GraphView.tsx'), /\{waitsOn\.length > 0 && \(/)
  assert.match(source('GraphView.tsx'), /\{blocks\.length > 0 && \(/)
  assert.match(source('FocusTree.tsx'), /\{waitsOn\.length > 0 && row\('Waits on'/)
  assert.match(source('FocusTree.tsx'), /\{blocks\.length > 0 && row\('Blocks'/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the edge list page test'
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

test('page: task details list Waits on and Blocks as bullets, one link per task', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light' }), { width: 1280, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`Boolean(document.querySelector('[data-section-box="links"] [data-edge-list]'))`)
  const lists = await page.evaluate(`[...document.querySelectorAll('[data-section-box="links"] [data-edge-list]')].map((ul) => ({
    label: ul.dataset.edgeList,
    tag: ul.tagName,
    bullet: getComputedStyle(ul).listStyleType,
    items: [...ul.children].map((li) => [li.tagName, li.querySelectorAll('button').length, li.querySelector('button').textContent.trim()]),
  }))`)
  assert.deepEqual(lists, [
    { label: 'Waits on', tag: 'UL', bullet: 'disc', items: [['LI', 1, 'Protocol tests']] },
    { label: 'Blocks', tag: 'UL', bullet: 'disc', items: [['LI', 1, 'Cutover']] },
  ])
  assert.deepEqual(page.errors, [])
})

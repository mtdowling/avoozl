// The Files fold in a real Chrome, on the harness page (?modal=task-files):
// the tree lists each change with its badge, a click shows the diff, Split
// draws it side by side, Show all files adds unchanged files, and Open in
// editor links point at the worktree. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Files fold browser test'

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

const click = (selector) => page.evaluate(`(() => { document.querySelector(${JSON.stringify(selector)}).click(); return true })()`)
const button = (text) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`

test('the Files fold shows the tree, a diff, split view, all files and editor links', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-files', theme: 'light' }), { width: 1280, height: 800 })
  await page.until(`Boolean(${button('Open the dialog')})`)
  await page.evaluate(`(() => { ${button('Open the dialog')}.click(); return true })()`)
  await page.until(`Boolean(document.querySelector('[data-file]'))`)
  const statuses = await page.evaluate(`[...document.querySelectorAll('[data-file]')].map((b) => [b.dataset.file, b.querySelector('[data-status]')?.dataset.status ?? null])`)
  assert.deepEqual(Object.fromEntries(statuses), {
    'src/app/old-name.mjs': 'deleted',
    'src/app/operations.mjs': 'modified',
    'src/app/renamed.mjs': 'renamed',
    'src/app/task-files.mjs': 'added',
    'assets/logo.png': 'modified',
    'README.md': 'modified',
    'notes.md': 'added',
  })
  assert.match(await page.evaluate(`document.querySelector('[data-files-totals]').textContent`), /7 files changed · \+264 −43/)
  assert.equal(await page.evaluate(`document.querySelector('[data-open-worktree]').getAttribute('href')`), 'kiro://file/srv/worktrees/a1')

  await click('[data-file="README.md"]')
  await page.until(`Boolean(document.querySelector('[data-diff] [data-line]'))`)
  const kinds = await page.evaluate(`[...document.querySelectorAll('[data-diff] [data-line]')].map((r) => r.dataset.line)`)
  assert.deepEqual(kinds.filter((k) => k !== 'context'), ['del', 'add', 'add', 'add'])
  assert.equal(await page.evaluate(`document.querySelector('[data-open-file]').getAttribute('href')`), 'kiro://file/srv/worktrees/a1/README.md:3')

  await page.evaluate(`(() => { ${button('Split')}.click(); return true })()`)
  await page.until(`Boolean(document.querySelector('[data-split-row]'))`)
  assert.equal(await page.evaluate(`${button('Split')}.getAttribute('aria-pressed')`), 'true')

  // The editor choice changes every link.
  await page.evaluate(`(() => { const s = document.querySelector('[data-task-files] select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'vscode'); s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  await page.until(`document.querySelector('[data-open-file]').getAttribute('href').startsWith('vscode://')`)

  await page.evaluate(`(() => { [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Show all files')).querySelector('input').click(); return true })()`)
  await page.until(`Boolean(document.querySelector('[data-file="package.json"]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-file="package.json"] [data-status]')`), null)
})

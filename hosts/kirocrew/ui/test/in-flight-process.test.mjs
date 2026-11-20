// In flight for a `process` session (R98.1, task 50.1): the status words,
// and in a real Chrome (harness ?page=app&process=1) the log tail, the cost
// and a copyable attach command in place of a chat link. The browser part is
// skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { processLine } from '../src/dashboard-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const details = (extra = {}) => ({ harness: 'claude-code', state: 'running', exitCode: null, run: 1, logTail: null, cost: null, attach: null, ...extra })

test('the status words: harness, state, the run when resumed, cost when known', () => {
  assert.equal(processLine(details()), 'claude-code · running')
  assert.equal(processLine(details({ state: 'requested' })), 'claude-code · starting')
  assert.equal(processLine(details({ state: 'exited', exitCode: 3, run: 2, cost: 1.5 })), 'claude-code · exited 3 · run 2 · $1.50')
  assert.equal(processLine(details({ cost: 0.0042 })), 'claude-code · running · $0.0042')
  assert.equal(processLine(details({ cost: 0 })), 'claude-code · running · $0.00')
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the In flight browser test'
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

test('a process row shows its log tail and cost, and Attach copies the command', { skip }, async () => {
  await page.open(harness.url({ page: 'app', process: '1' }), { width: 1280, height: 900 })
  await page.until(`document.querySelectorAll('[data-in-flight-row]').length === 2`, 30000)
  const row = `[...document.querySelectorAll('[data-in-flight-row]')].find((r) => r.querySelector('[data-process-status]'))`
  assert.match(await page.evaluate(`${row}.querySelector('[data-process-status]').textContent`), /claude-code · running · run 2 · \$0\.83/)
  assert.match(await page.evaluate(`${row}.querySelector('[data-process-log]').textContent`), /Writing \.avoozl\/result\.json/)
  // No chat link for a child, which shows View worker log; the Kiro Crew
  // reviewer row keeps its chat link (direct-links D2).
  assert.equal(await page.evaluate(`${row}.querySelectorAll('[data-attempt-link]').length`), 0)
  assert.equal(await page.evaluate(`${row}.querySelectorAll('button[aria-label^="View worker log"]').length`), 1)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-attempt-link]').length`), 1)
  await page.evaluate(
    `(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t } } }) })()`,
  )
  await page.evaluate(`${row}.querySelector('[data-copy-attach]').click()`)
  await page.until(`window.__copied !== null`, 5000)
  assert.match(await page.evaluate('window.__copied'), /^cd \/work\/recipe-box-m3 && claude --resume 6f1c/)
  await page.until(`${row}.querySelector('[data-copy-attach]').textContent.includes('Copied')`, 5000)
  assert.deepEqual(page.errors, [])
})

test('Send message on a process row queues session.send; a chat row has none', { skip }, async () => {
  await page.open(harness.url({ page: 'app', process: '1' }), { width: 1280, height: 900 })
  await page.until(`document.querySelectorAll('[data-in-flight-row]').length === 2`, 30000)
  const row = `[...document.querySelectorAll('[data-in-flight-row]')].find((r) => r.querySelector('[data-process-status]'))`
  assert.equal(await page.evaluate(`document.querySelectorAll('button[aria-label^="Send message"]').length`), 1)
  await page.evaluate(`${row}.querySelector('button[aria-label^="Send message"]').click()`)
  await page.until(`Boolean(${row}.querySelector('[data-send-message] textarea'))`, 5000)
  assert.equal(await page.evaluate(`${row}.querySelector('[data-send-submit]').disabled`), true, 'empty: no send')
  await page.evaluate(`(() => {
    const area = ${row}.querySelector('[data-send-message] textarea')
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, 'Also cover the empty pantry.')
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await page.until(`!${row}.querySelector('[data-send-submit]').disabled`, 5000)
  await page.evaluate(`${row}.querySelector('[data-send-submit]').click()`)
  await page.until(`${row}.querySelector('[data-send-state]').dataset.sendState === 'queued'`, 5000)
  assert.deepEqual(await page.evaluate('window.__sent'), [{ slot: 'process-6f1c2b9e-4d7a-4c1e-9b0a-2f5e8d3c7a41', text: 'Also cover the empty pantry.' }])
  assert.equal(await page.evaluate(`${row}.querySelector('[data-send-message] textarea').value`), '')
  assert.deepEqual(page.errors, [])
})

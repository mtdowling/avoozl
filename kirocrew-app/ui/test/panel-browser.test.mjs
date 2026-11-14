// The side panel in a real Chrome, on the harness page (?page=panel): what a
// normal chat shows, that it reads again on focus and not while hidden, and
// what each other chat context shows. Set AVOOZL_PANEL_SHOTS=<dir> to also
// write a screenshot of each context. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the side panel browser test'

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

const text = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
const count = (selector) => page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
const open = async (query, ready) => {
  await page.open(harness.url({ page: 'panel', theme: 'light', ...query }), { width: 360, height: 900 })
  await page.until(ready)
}
const shot = async (name) => {
  const dir = process.env.AVOOZL_PANEL_SHOTS
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  await page.evaluate(`document.querySelectorAll('details').forEach((d) => (d.open = true))`)
  await page.screenshot(path.join(dir, `${name}.png`))
}

test('a normal chat shows Waiting on you, In flight, the queue head, recent merges and the line', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  assert.match(await text('[data-recap-line]'), /2 waiting on you · 3 in flight · line running/)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-waiting-row]')].map((r) => r.dataset.waitingRow)`), ['needs-human', 'github-conflict'])
  // The retired worker row is not shown.
  assert.doesNotMatch(await text('[data-panel-recap]'), /retired worker/)
  const buttons = await page.evaluate(`[...document.querySelectorAll('[data-waiting-row] button, [data-waiting-row] a')].map((e) => e.textContent.trim())`)
  assert.deepEqual(buttons, ['Open issue', "Keep Avoozl's", "Keep GitHub's"])
  assert.equal(await count('[data-flight-row]'), 3)
  assert.equal(await page.evaluate(`document.querySelector('[data-flight-row="radar"] a').getAttribute('href')`), '/chat?sid=crew-abc')
  assert.equal(await count('[data-queue-head]'), 1)
  assert.equal(await count('[data-recent-row]'), 1)
  assert.match(await text('[data-panel-driver]'), /Start a driver session/)
  assert.equal(await count('[data-panel-line]'), 1)
  await shot('normal-chat')
})

test('Keep Avoozl\'s writes the choice and reads again', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.evaluate(`[...document.querySelectorAll('[data-waiting-row] button')].find((b) => b.textContent.trim() === "Keep Avoozl's").click()`)
  await page.until(`window.__panelCalls.length === 1`)
  assert.deepEqual(await page.evaluate(`window.__panelCalls[0]`), { taskId: 'S8', field: 'title', choice: 'desired' })
})

test('it reads again on window focus and not while the page is hidden', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  const reads = await page.evaluate(`window.__panelReads`)
  await page.evaluate(`window.__panel.conflicts = []; window.dispatchEvent(new Event('focus')); true`)
  await page.until(`window.__panelReads > ${reads} && !document.querySelector('[data-waiting-row]')`)
  assert.match(await text('[data-panel-fold="waiting"]'), /Nothing is waiting on you/)
  // Hidden: a focus event reads nothing.
  await page.evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); window.__panel.conflicts = [{ kind: 'needs-human', reason: 'crew', taskId: null, title: 'Late', detail: 'd' }]; window.dispatchEvent(new Event('focus')); true`)
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.equal(await count('[data-waiting-row]'), 0)
  // Visible again: it reads.
  await page.evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); true`)
  await page.until(`Boolean(document.querySelector('[data-waiting-row]'))`)
})

test('one failed read leaves the other sections showing', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.evaluate(`window.__panel.fail = 'x'; window.dispatchEvent(new Event('focus')); true`)
  await page.until(`/could not read what is waiting/.test(document.querySelector('[data-panel-fold="waiting"]')?.textContent ?? '')`)
  assert.match(await text('[data-panel-fold="in-flight"]'), /could not read the crews/)
})

test('with nothing to show, each section says so', { skip }, async () => {
  await open({ sid: 'chat-1', state: 'empty' }, `/Nothing is waiting/.test(document.body.textContent)`)
  assert.match(await text('[data-panel-fold="in-flight"]'), /No crew has a claim/)
  assert.match(await text('[data-recap-line]'), /0 waiting on you · 0 in flight/)
  await shot('empty')
})

test('a Spec Builder chat shows the spec check and Approve', { skip }, async () => {
  await open({ sid: 'spec-builder-search-v2' }, `Boolean(document.querySelector('[data-panel-spec] button'))`)
  assert.match(await text('[data-panel-spec]'), /Tasks: 12/)
  assert.match(await text('[data-panel-spec]'), /Approve for Avoozl/)
  assert.equal(await count('[data-panel-line]'), 1)
  await shot('spec-builder-chat')
})

test('a crew chat shows its claim, rail and links', { skip }, async () => {
  await open({ sid: 'crew-abc' }, `Boolean(document.querySelector('[data-panel-crew] [data-rail]'))`)
  assert.match(await text('[data-panel-crew]'), /acme\/recipe-box#52 Index builder: CI, PR #57/)
  assert.equal(await count('[data-rail-step]'), 5)
  assert.match(await text('[data-panel-crew]'), /PR #57/)
  await shot('crew-chat')
})

test('an Avoozl chat shows the driver view with waiting, in flight and the queue', { skip }, async () => {
  await open({ sid: 'avoozl_driver_1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  assert.equal(await count('[data-panel-driver]'), 1)
  assert.equal(await count('[data-flight-row]'), 3)
  assert.equal(await count('[data-queue-head]'), 1)
  await shot('avoozl-chat')
})

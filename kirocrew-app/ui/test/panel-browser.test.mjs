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
  assert.equal(await page.evaluate(`document.querySelector('[data-panel-driver]').dataset.panelDriver`), 'none')
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

const driverButtons = `[...document.querySelectorAll('[data-panel-driver] a, [data-panel-driver] button')].map((e) => e.textContent.trim())`
const ready = `Boolean(document.querySelector('[data-panel-driver]')) && !document.querySelector('[data-panel-driver]').textContent.includes('Reading')`

test('a driver session that checked in shows a link and no Start', { skip }, async () => {
  await open({ sid: 'chat-1', driver: 'running' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.until(`document.querySelector('[data-panel-driver]')?.dataset.panelDriver === 'running'`)
  assert.deepEqual(await page.evaluate(driverButtons), ['Open driver session'])
  assert.equal(await page.evaluate(`document.querySelector('[data-panel-driver] a').getAttribute('href')`), '/chat?sid=chat-7-1')
  assert.match(await text('[data-panel-driver]'), /Last seen 5 min ago/)
  await shot('driver-running')
})

test('a quiet driver keeps its link and offers a new one', { skip }, async () => {
  await open({ sid: 'chat-1', driver: 'idle' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.until(`document.querySelector('[data-panel-driver]')?.dataset.panelDriver === 'idle'`)
  assert.deepEqual(await page.evaluate(driverButtons), ['Open driver session', 'Start a new driver session'])
})

test('an unreadable driver offers no Start, so a second one is never opened by mistake', { skip }, async () => {
  await open({ sid: 'chat-1', driver: 'unknown' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.until(`document.querySelector('[data-panel-driver]')?.dataset.panelDriver === 'unknown'`)
  assert.deepEqual(await page.evaluate(driverButtons), [])
})

test('Start opens the avoozl-driver agent with its first message and nothing else', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-driver-start]'))`)
  assert.equal(await page.evaluate(`(window.__chats ?? []).length`), 0)
  await page.evaluate(`document.querySelector('[data-driver-start]').click()`)
  const chats = await page.evaluate(`window.__chats`)
  assert.equal(chats.length, 1)
  assert.equal(chats[0].agent, 'avoozl-driver')
  assert.equal(chats[0].autoSend, true)
  assert.match(chats[0].message, /do not merge/i)
})

test('the driver chat itself shows the driver, waiting and in flight views', { skip }, async () => {
  await open({ sid: 'chat-7-1', driver: 'running' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  await page.until(`document.querySelector('[data-panel-kind]')?.dataset.panelKind === 'avoozl'`)
  assert.equal(await count('[data-flight-row]'), 3)
})

test('Attach / steer opens the crew chat; a row with no action deep-links into the page', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-flight-row]'))`)
  assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-flight-row="radar"] a')].map((a) => a.textContent.trim())[0]`), 'Attach / steer')
  await page.evaluate(`window.__panel.conflicts = [{ kind: 'content-match', taskId: 'S1', id: 'd1', title: 'Matched a rule', detail: 'd' }]; window.dispatchEvent(new Event('focus')); true`)
  await page.until(`Boolean(document.querySelector('[data-waiting-row="content-match"]'))`)
  await page.evaluate(`[...document.querySelectorAll('[data-waiting-row] button')].find((b) => b.textContent.trim() === 'Open in Avoozl').click()`)
  assert.deepEqual(await page.evaluate(`window.__navigated`), ['/apps/avoozl'])
})

test('coming back after a while shows what finished and what is new, and Got it hides it', { skip }, async () => {
  await open({ sid: 'chat-1' }, `Boolean(document.querySelector('[data-waiting-row]'))`)
  assert.equal(await count('[data-since-recap]'), 0)
  // Leave two minutes ago with only the first row waiting; one task finished since.
  await page.evaluate(`(() => {
    const first = [...document.querySelectorAll('[data-waiting-row]')]
    window.__panel.conflicts = window.__panel.conflicts.slice(0, 1).concat([{ kind: 'needs-human', reason: 'crew', taskId: null, id: 'new', title: 'A new question', detail: 'd' }])
    window.__panel.tasks = [{ taskId: 'S7', title: 'Fresh merge', repository: 'acme/recipe-box', finishedAt: new Date().toISOString() }]
    return first.length
  })()`)
  await page.evaluate(`window.dispatchEvent(new Event('focus')); true`)
  await page.until(`[...document.querySelectorAll('[data-waiting-row]')].some((r) => r.textContent.includes('A new question'))`)
  // The keys of the first read, as the panel stores them on blur.
  const keys = await page.evaluate(`[...document.querySelectorAll('[data-waiting-row]')].filter((r) => !r.textContent.includes('A new question')).map((r) => r.dataset.waitingRow)`)
  assert.ok(keys.length >= 1)
  await page.evaluate(`localStorage.setItem('avoozl.panel.away', JSON.stringify({ at: Date.now() - 120000, waitingKeys: ['needs-human::crew:' ] }))`)
  await page.evaluate(`window.dispatchEvent(new Event('focus')); true`)
  await page.until(`Boolean(document.querySelector('[data-since-recap]'))`)
  assert.match(await text('[data-since-finished]'), /Fresh merge/)
  assert.match(await text('[data-since-needs-you]'), /A new question/)
  assert.match(await text('[data-since-recap]'), /2 min ago/)
  await shot('since-you-left')
  await page.evaluate(`[...document.querySelectorAll('[data-since-recap] button')].find((b) => b.textContent.trim() === 'Got it').click()`)
  await page.until(`!document.querySelector('[data-since-recap]')`)
  // Focus again without leaving: the recap stays away.
  await page.evaluate(`window.dispatchEvent(new Event('focus')); true`)
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(await count('[data-since-recap]'), 0)
})

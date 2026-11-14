// Settings › Routing drawn in a real Chrome (skipped when none is found),
// on replies from a real backend: an empty and a blank .avoozl.json, old
// routing keys, routing on, routing on after failures, and an older
// backend (its reply captured from the code before PR #33, and one with no
// routing.view at all). Any thrown error, or either error boundary, fails.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { OUTDATED_LINE, healthLines, isCurrentView, isUnknownOperation } from '../src/routing-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { routingReplies, routingScript } from './browser/routing-replies.mjs'

const PRE_33 = JSON.parse(readFileSync(new URL('./browser/fixtures/routing-pre-33.json', import.meta.url), 'utf8'))

test('an older backend reply is not current; this backend reply is', async () => {
  assert.equal(isCurrentView(PRE_33['routing.view'].result), false)
  assert.equal(isCurrentView(null), false)
  const { on } = await routingReplies(['on'])
  assert.equal(isCurrentView(on['routing.view'].result), true)
  assert.ok(isUnknownOperation('Unknown operation routing.view'))
  assert.ok(!isUnknownOperation('Settings on this machine changed'))
})

test('the health lines name the last success, the last error, and the wait', () => {
  assert.deepEqual(healthLines(undefined, true), [])
  const lines = healthLines({ failures: 2, lastSuccessAt: null, lastError: 'no reply within 90 s', lastErrorAt: 't', retryAt: 'r' }, true)
  assert.deepEqual(lines, ['Last success: none yet.', 'Last error: no reply within 90 s (t).', 'Failures in a row: 2.', 'Ready tasks wait; nothing runs on this machine instead. Next try: r.'])
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the routing page test'
let harness, browser, replies
before(async () => {
  if (skip) return
  replies = await routingReplies()
  // Routing on, after three failures (the health box and its wait line).
  const failing = structuredClone(replies.on)
  failing['routing.view'].result.health = { failures: 3, lastSuccessAt: null, lastError: 'the reply was not a list of {task, crew, model, reason}', lastErrorAt: '2026-11-14T00:00:00.000Z', retryAt: '2026-11-14T00:15:00.000Z' }
  replies.failing = failing
  replies['pre-33'] = PRE_33
  replies['no-view'] = { 'routing.view': { error: 'Unknown operation routing.view', status: 404 }, 'routing.preview': { error: 'Unknown operation routing.preview', status: 404 } }
  harness = await buildHarness({ scripts: { 'routing.js': routingScript(replies) } })
  browser = await launch(chrome)
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

// Draws one state; fails on a thrown error or either boundary, and returns
// the page's text once it settles past Loading.
async function draw(state) {
  const page = await browser.page()
  await page.open(harness.url({ page: 'routing', state }), { width: 1280, height: 900 })
  await page.until(`(() => { const r = document.querySelector('[data-routing]'); return Boolean(document.querySelector('[data-harness-crash],[data-error-boundary]')) || (r && !r.innerText.includes('Loading…')) })()`)
  await page.evaluate('new Promise((r) => setTimeout(r, 150))')
  const crash = await page.evaluate(`document.querySelector('[data-harness-crash],[data-error-boundary]')?.textContent ?? null`)
  assert.equal(crash, null, `${state}: the page crashed`)
  assert.deepEqual(page.errors, [], `${state}: errors were thrown`)
  return page.evaluate(`document.querySelector('[data-routing]').innerText`)
}

test('Settings › Routing draws every state without an error', { skip }, async () => {
  const empty = await draw('empty')
  assert.match(empty, /Off: every task runs on this machine/)
  for (const title of ['Routing prompt', 'Providers', 'Crews', 'Preview']) assert.match(empty, new RegExp(title))
  assert.match(await draw('blank'), /Unsupported workspace Avoozl configuration version/)
  assert.match(await draw('old-keys'), /not \.avoozl\.json|old routing keys/)
  const on = await draw('on')
  assert.match(on, /they never run here instead/)
  assert.doesNotMatch(on, /falls back to local/)
  const failing = await draw('failing')
  assert.match(failing, /Failures in a row: 3\./)
  assert.match(failing, /Last error: the reply was not a list/)
  assert.match(failing, /nothing runs on this machine instead/)
})

test('an older backend shows the out-of-date line, not a crash', { skip }, async () => {
  for (const state of ['pre-33', 'no-view']) {
    const text = await draw(state)
    assert.ok(text.includes(OUTDATED_LINE), `${state}: ${text}`)
  }
})

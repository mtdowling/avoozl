// The side panel on replies a real backend gave: the sample workspace is built
// by src/app/demo.mjs and read through its own operations, so a reply whose
// shape drifts from what the panel reads fails here. One page per chat kind:
// a normal chat, a Spec Builder chat, a crew chat and an Avoozl chat. Set
// AVOOZL_PANEL_SHOTS=<dir> to write a screenshot of each. Skipped without Chrome.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { demoOperations, installDemo } from '../../../src/app/demo.mjs'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the real-reply panel test'

let harness, browser, page, replies
before(async () => {
  if (skip) return
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avoozl-panel-real-'))
  const { root } = await installDemo(path.join(tmp, 'demo'))
  const demo = demoOperations(root)
  replies = {}
  try {
    // The panel's one read, from the real operations over the sample workspace.
    replies['panel.view'] = await demo.execute('panel.view', {})
  } finally {
    demo.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  harness = await buildHarness({ scripts: { 'real.js': `window.__REAL_PANEL = ${JSON.stringify(replies)};` } })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const count = (selector) => page.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
const open = async (sid, ready) => {
  await page.open(harness.url({ page: 'panel', real: '1', theme: 'light', sid }), { width: 360, height: 900 })
  await page.until(ready)
}
const shot = async (name) => {
  const dir = process.env.AVOOZL_PANEL_SHOTS
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  await page.evaluate(`document.querySelector('[data-pp-toggle-all][aria-pressed=false]')?.click()`)
  await page.screenshot(path.join(dir, `${name}.png`))
}
const rows = `Boolean(document.querySelector('[data-waiting-row]')) && Boolean(document.querySelector('[data-flight-row]'))`

test('a normal chat shows real waiting rows and crews', { skip }, async () => {
  assert.ok(replies['panel.view'].conflicts.length > 0, 'the sample has something waiting')
  await open('chat-1', rows)
  assert.ok((await count('[data-waiting-row]')) > 0)
  assert.ok((await count('[data-flight-row]')) > 0)
  assert.doesNotMatch(await page.evaluate(`document.body.textContent`), /Recap\s*0 crews/i)
  await shot('normal-chat')
})

test('a Spec Builder chat shows the spec check for a real spec', { skip }, async () => {
  const spec = replies['panel.view'].specs[0]
  await open(`spec-builder-${spec.name}`, `Boolean(document.querySelector('[data-panel-spec]')) && document.querySelector('[data-panel-spec]').textContent.includes('Files:')`)
  assert.equal(await page.evaluate(`document.querySelector('[data-panel-kind]').dataset.panelKind`), 'spec-builder')
  await shot('spec-builder-chat')
})

test('a crew chat shows the claim of a real crew', { skip }, async () => {
  const row = replies['panel.view'].crews.rows.find((item) => item.crewId)
  assert.ok(row, 'the sample has a crew with an id')
  await open(`crew-${row.crewId}`, `Boolean(document.querySelector('[data-panel-crew]')) && document.querySelector('[data-panel-crew]').textContent.includes(${JSON.stringify(row.title)})`)
  assert.equal(await count('[data-rail-step]') > 0, true)
  await shot('crew-chat')
})

test('an avoozl_ chat shows waiting rows', { skip }, async () => {
  await open('avoozl_live', `document.querySelector('[data-panel-kind]')?.dataset.panelKind === 'avoozl' && Boolean(document.querySelector('[data-waiting-row]'))`)
  await shot('avoozl-chat')
})

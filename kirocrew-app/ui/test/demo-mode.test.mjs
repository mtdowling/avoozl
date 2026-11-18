// Demo mode on the page (design §6.11): the guard every host call passes,
// and, in a real Chrome (AVOOZL_CHROME or an installed Chrome), the whole
// page on the real sample's replies: Start demo, the badge and the demo bar,
// a preview for a change, and Exit demo back to the person's workspace.
// There is no guided tour. The browser part is skipped when no Chrome is
// found.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import * as demoApi from '../src/demo-api.ts'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'
import { SIZES, THEMES, showDemo } from './browser/demo-screenshots.mjs'

const { CHAT_PREVIEW, DEMO_CATALOG, DEMO_WORKSPACE_ID, demoAllows, guardApi, previewOf } = demoApi

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('the demo ID can never be a catalog workspace ID', () => {
  // host-config.mjs WORKSPACE_ID: a lowercase letter first.
  assert.doesNotMatch(DEMO_WORKSPACE_ID, /^[a-z][a-z0-9-]{0,60}$/)
})

test('in the demo only Avoozl commands and reads reach the host', async () => {
  assert.equal(demoAllows('post', COMMAND_PATH), true)
  assert.equal(demoAllows('get', '/api/models'), true)
  for (const [method, path] of [
    ['post', '/api/spec-builder/specs'],
    ['post', '/api/reveal'],
    ['request', COMMAND_PATH],
    ['put', COMMAND_PATH],
    ['del', COMMAND_PATH],
  ])
    assert.equal(demoAllows(method, path), false, `${method} ${path}`)
  const seen = [],
    notices = []
  const host = {
    request: async (path) => seen.push(['request', path]),
    get: async (path) => seen.push(['get', path]),
    post: async (path, body) => {
      seen.push(['post', path, body.operation])
      if (body.operation === 'task.start') throw Object.assign(Error('409'), { status: 409, body: JSON.stringify({ error: 'Demo mode: would start.', demo: true }) })
      return { result: 'ok' }
    },
    put: async (path) => seen.push(['put', path]),
    del: async (path) => seen.push(['del', path]),
  }
  const api = guardApi(host, (text) => notices.push(text))
  await assert.rejects(api.post('/api/spec-builder/specs', {}), /Demo mode/)
  await assert.rejects(api.request('/api/reveal'), /Demo mode/)
  await assert.rejects(api.put(COMMAND_PATH, {}), /Demo mode/)
  // The machine's own catalog never shows; adding a workspace is refused.
  assert.deepEqual(await api.post(COMMAND_PATH, { operation: 'workspaces.list' }), { result: DEMO_CATALOG })
  await assert.rejects(api.post(COMMAND_PATH, { operation: 'workspaces.add', input: {} }), /Demo mode/)
  // A command passes; the backend's preview is shown as a notice.
  assert.deepEqual(await api.post(COMMAND_PATH, { operation: 'graph.view' }), { result: 'ok' })
  await assert.rejects(api.post(COMMAND_PATH, { operation: 'task.start' }))
  assert.deepEqual(seen, [
    ['post', COMMAND_PATH, 'graph.view'],
    ['post', COMMAND_PATH, 'task.start'],
  ])
  assert.equal(notices.length, 5)
  assert.equal(notices.at(-1), 'Demo mode: would start.')
  assert.equal(previewOf({ body: '{"error":"x"}' }), null)
  assert.match(CHAT_PREVIEW, /No chat started/)
})

test('every view takes the host hooks through host.ts', () => {
  const dir = new URL('../src/', import.meta.url)
  for (const name of ['App.tsx', 'TaskDrawer.tsx', 'PlansView.tsx', 'ui/controls.tsx', 'NewPlanDrawer.tsx', 'PluginsSettings.tsx', 'RepositoriesSettings.tsx']) {
    const text = readFileSync(new URL(name, dir), 'utf8')
    assert.doesNotMatch(text, /import \{[^}]*\buse(AppApi|ChatLauncher)\b[^}]*\} from '@kirocrew\/app-sdk'/, name)
  }
  assert.match(source('host.ts'), /active \? \{ openChat: \(\) => notice\(CHAT_PREVIEW\) \}/)
})

test('Demo mode has no guided tour', () => {
  for (const name of ['TOUR', 'stepTo', 'tourKey']) assert.equal(name in demoApi, false, name)
  for (const name of ['Demo.tsx', 'App.tsx']) {
    assert.doesNotMatch(source(name), /DemoTour|data-demo-tour|data-tour-on|Start the tour/, name)
  }
  assert.doesNotMatch(source('Demo.tsx'), /tour/i)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Demo mode test'

let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({ scripts: { 'demo.js': demoScript(await demoReplies()) } })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const button = (text, role) => `[...document.querySelectorAll('button${role === 'tab' ? '[data-nav-head]' : role ? `[role="${role}"]` : ''}')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
// A count badge may follow the label, so compare the start.
const selectedTab = `document.querySelector('[data-nav-head][data-selected], [data-nav-head][data-open]')?.textContent.trim()`

test('Start demo opens the made-up workspace with its bar, and Exit demo returns', { skip }, async () => {
  await page.open(harness.url({ page: 'demo' }), { width: 1280, height: 800 })
  await page.until(`Boolean(${button('Start demo')} && document.querySelector('[data-workspace-pill]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-badge]'))`), false)
  // Its tooltip says what it opens, and names no tour.
  assert.match(source('Demo.tsx'), /Open a made-up workspace to look around\. Your own work is not touched\./)
  await click(button('Start demo'))

  // The badge and the bar show; the workspace pill names the sample; no tour opens.
  await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-badge]'))`), true)
  assert.match(await page.evaluate(`document.querySelector('[data-left-nav] [data-workspace-pill]')?.textContent ?? ''`), /Demo: Recipe Box/)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-tour]'))`), false)
  assert.equal(await page.evaluate(`Boolean(${button('Start the tour')})`), false)
  // The made-up workspace's pages read its sample.
  await page.until(`Boolean(document.querySelector('[data-attention-row]'))`)
  await click(button('Specs', 'tab'))
  await page.until(`Boolean(document.querySelector('[data-spec-list] [data-plan-row]'))`)

  // A change shows what it would do; nothing else happens.
  await click(button('Dashboards', 'tab'))
  // Stop the line is an icon in the Dashboards › Delivery heading.
  await page.until(`Boolean(document.querySelector('[data-nav-item="dashboard/delivery"]'))`)
  await click(`document.querySelector('[data-nav-item="dashboard/delivery"]')`)
  await page.until(`Boolean(document.querySelector('[data-heading-actions] [data-stop-line]'))`)
  await click(`document.querySelector('[data-stop-line]')`)
  await page.until(`Boolean(document.querySelector('[data-stop-reason]'))`)
  await page.evaluate(`(() => {
    const input = document.querySelector('[data-stop-reason]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Showing the demo')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await click(`document.querySelector('[data-stop-confirm]')`)
  await page.until(`document.querySelector('[data-demo-notice]')?.textContent.includes('stop the line')`)
  assert.match(await page.evaluate(`document.querySelector('[data-stop-dialog] [role="alert"]')?.textContent ?? ''`), /^Demo mode: in your own workspace this would stop the line/)
  await click(`[...document.querySelectorAll('[data-stop-dialog] button')].find((b) => b.textContent.trim() === 'Cancel')`)
  // Cancel asks first once a reason was typed.
  await page.until(`Boolean([...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Discard')) || !document.querySelector('[data-stop-reason]')`)
  await page.evaluate(`(() => { [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Discard')?.click(); return true })()`)
  await page.until(`!document.querySelector('[data-stop-reason]')`)

  // Exit demo: the person's workspace again, no badge.
  await click(`document.querySelector('[data-demo-exit]')`)
  await page.until(`!document.querySelector('[data-demo-badge]') && document.querySelector('[data-workspace-pill]')?.dataset.workspaceId === 'w'`)
  assert.equal(await page.evaluate(`document.querySelector('[data-workspace-pill]').dataset.workspaceId`), 'w')
  assert.deepEqual(page.errors, [])
})

test('the demo bar fits the screen at 320, 768 and 1280 px, light and dark', { skip }, async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'avoozl-demo-shots-'))
  try {
    for (const [width, height] of SIZES)
      for (const theme of THEMES) {
        const box = await showDemo(page, harness, { width, height, theme })
        const where = `${width} ${theme}`
        assert.equal(box.badge, true, where)
        assert.ok(box.left >= 0 && box.right <= box.inner, `${where}: the bar is inside the width`)
        assert.ok(box.scroll <= box.inner, `${where}: no sideways scroll`)
        const file = path.join(out, `demo-${width}-${theme}.png`)
        await page.screenshot(file)
        assert.ok(statSync(file).size > 1000, file)
      }
    assert.deepEqual(page.errors, [])
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('the demo fixtures stay in their shapes', async () => {
  const { fixturesClient, stopExample } = await import('../src/demo-fixtures.ts')
  // The page asks for the fixtures through the one command path, read only.
  const seen = []
  const api = { post: async (path, body) => (seen.push([path, body.operation]), { result: { stopLine: { running: { state: 'running' }, stopped: { state: 'stopped' } } } }) }
  const fixtures = await fixturesClient(api).read()
  assert.deepEqual(seen, [[COMMAND_PATH, 'demo.fixtures']])
  assert.equal(stopExample(fixtures, 'stopped').state, 'stopped')
  // The provider offers the data and the toggle to every screen.
  assert.match(source('Demo.tsx'), /export const useDemoFixtures/)
  assert.match(source('Demo.tsx'), /data-demo-stop-example/)
})

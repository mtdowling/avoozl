// Demo mode on the page (design §6.11): the guard every host call passes,
// the tour's steps and keys, and, in a real Chrome (AVOOZL_CHROME or an
// installed Chrome), the whole page on the real sample's replies: Try the
// demo, the badge, every tour step with Next, Back and the keys, a preview
// for a change, and Exit demo back to the person's workspace. The browser
// part is skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { CHAT_PREVIEW, DEMO_CATALOG, DEMO_WORKSPACE_ID, TOUR, demoAllows, guardApi, previewOf, stepTo, tourKey } from '../src/demo-api.ts'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'
import { SIZES, THEMES, showStep } from './browser/demo-screenshots.mjs'

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
  for (const name of ['App.tsx', 'TaskDrawer.tsx', 'PlansView.tsx', 'controls.tsx', 'NewPlanDrawer.tsx', 'PluginsSettings.tsx', 'RepositoriesSettings.tsx']) {
    const text = readFileSync(new URL(name, dir), 'utf8')
    assert.doesNotMatch(text, /import \{[^}]*\buse(AppApi|ChatLauncher)\b[^}]*\} from '@kirocrew\/app-sdk'/, name)
  }
  assert.match(source('host.ts'), /active \? \{ openChat: \(\) => notice\(CHAT_PREVIEW\) \}/)
})

test('the tour covers each page, and its keys move inside it', () => {
  assert.deepEqual(
    TOUR.map((s) => s.id),
    ['dashboard', 'specs', 'graph', 'task', 'intake', 'flow', 'needs-you', 'stop-line', 'settings'],
  )
  for (const step of TOUR) assert.ok(step.caption.length > 20 && step.title, step.id)
  assert.equal(TOUR.find((s) => s.id === 'task').task, 'recipe-import.2.1')
  assert.equal(stepTo(0, 'back'), 0)
  assert.equal(stepTo(0, 'next'), 1)
  assert.equal(stepTo(TOUR.length - 1, 'next'), TOUR.length - 1)
  assert.equal(stepTo(4, 'first'), 0)
  assert.equal(stepTo(0, 'last'), TOUR.length - 1)
  assert.equal(tourKey('ArrowRight'), 'next')
  assert.equal(tourKey('ArrowLeft'), 'back')
  assert.equal(tourKey('Escape'), 'close')
  assert.equal(tourKey('a'), null)
  // Motion is off under reduced motion.
  assert.match(source('Demo.tsx'), /@media \(prefers-reduced-motion: reduce\)\{\[data-demo-caption\]\{animation:none\}\}/)
  assert.match(source('Demo.tsx'), /behavior: reduced \? 'auto' : 'smooth'/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the demo tour test'

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

const button = (text, role) => `[...document.querySelectorAll('button${role ? `[role="${role}"]` : ''}')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
// A count badge may follow the label, so compare the start.
const selectedTab = `document.querySelector('[aria-label="Avoozl views"] [aria-selected="true"]')?.textContent.trim()`
const tourStep = `document.querySelector('[data-demo-tour]')?.dataset.step`
// Graph is a page inside Epics, and Intake lives under Waiting on you.
const TAB = { dashboard: 'Home', plans: 'Epics', graph: 'Epics', untriaged: 'Waiting on you', flow: 'Flow', settings: 'Settings' }

test('Start demo opens the tour over the real pages, and Exit demo returns', { skip }, async () => {
  await page.open(harness.url({ page: 'demo' }), { width: 1280, height: 800 })
  await page.until(`Boolean(${button('Start demo')} && document.querySelector('[aria-label="Workspace"]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-badge]'))`), false)
  await click(button('Start demo'))

  // The badge replaces the workspace picker; the tour starts on step 1.
  await page.until(`${tourStep} === 'dashboard'`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-badge]'))`), true)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[aria-label="Workspace"]'))`), false)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-bar]'))`), true)

  // Next through every step, by button and by key.
  for (let i = 0; i < TOUR.length; i++) {
    const step = TOUR[i]
    await page.until(`${tourStep} === ${JSON.stringify(step.id)}`)
    await page.until(`${selectedTab}?.startsWith(${JSON.stringify(TAB[step.tab])})`)
    assert.match(await page.evaluate(`document.querySelector('[data-demo-tour]').textContent`), new RegExp(`Step ${i + 1} of ${TOUR.length}`))
    if (step.task) await page.until(`document.querySelector('[role="dialog"], [data-task-drawer], aside')?.textContent.includes('Show import errors')`)
    if (step.id === 'stop-line') await page.until(`document.querySelector('[data-stop-line]')?.hasAttribute('data-tour-on')`)
    if (i === TOUR.length - 1) break
    if (i % 2) await click(button('Next'))
    else await page.key('ArrowRight', 'ArrowRight', 39)
  }
  // Back by key and by button, then Escape closes the tour.
  await page.key('ArrowLeft', 'ArrowLeft', 37)
  await page.until(`${tourStep} === 'stop-line'`)
  await click(button('Back'))
  await page.until(`${tourStep} === 'needs-you'`)
  await page.key('Escape')
  await page.until(`!document.querySelector('[data-demo-tour]')`)

  // A change shows what it would do; nothing else happens.
  await click(button('Home', 'tab'))
  await page.until(`Boolean(${button('Stop the line')})`)
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
  await click(button('Start the tour'))
  await page.until(`${tourStep} === 'dashboard'`)
  await click(button('Close the tour'))
  await page.until(`!document.querySelector('[data-demo-tour]')`)

  // Exit demo: the person's workspace again, no badge.
  await click(`document.querySelector('[data-demo-exit]')`)
  await page.until(`!document.querySelector('[data-demo-badge]') && Boolean(document.querySelector('[aria-label="Workspace"]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="Workspace"]').value`), 'w')
  assert.deepEqual(page.errors, [])
})

test('the tour fits the screen at 320, 768 and 1280 px, light and dark', { skip }, async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'avoozl-demo-shots-'))
  try {
    for (const [width, height] of SIZES)
      for (const theme of THEMES)
        for (const step of ['dashboard', 'task', 'stop-line']) {
          const box = await showStep(page, harness, { width, height, theme, step })
          const where = `${step} at ${width} ${theme}`
          assert.equal(box.badge, true, where)
          assert.ok(box.left >= 0 && box.right <= box.inner, `${where}: the card is inside the width`)
          assert.ok(box.top >= 0 && box.bottom <= box.innerHeight, `${where}: the card is inside the height`)
          const file = path.join(out, `${step}-${width}-${theme}.png`)
          await page.screenshot(file)
          assert.ok(statSync(file).size > 1000, file)
        }
    assert.deepEqual(page.errors, [])
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

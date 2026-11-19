// The standalone page in a real Chrome, served by the real `avoozl serve`
// code on a scratch machine: Open chat as a process session (SW7), the
// Needs Kiro Crew states (SW10) and browser notices (SW8). Skipped when no
// Chrome is found (AVOOZL_CHROME).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the standalone page tests'
const ui = fileURLToPath(new URL('..', import.meta.url))
const src = (file) => import(new URL(`../../../src/app/${file}`, import.meta.url).href)

let server, browser, page, machine, store, root, close
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'avoozl-standalone-page-'))

before(async () => {
  if (skip) return
  // Chrome starts first, in the real environment; the scratch machine is set after.
  browser = await launch(chrome)
  page = await browser.page()
  // The machine is the scratch folder: the server and the supervisor read the
  // same state and configuration folders through these variables.
  process.env.HOME = process.env.USERPROFILE = path.join(scratch, 'home')
  process.env.XDG_CONFIG_HOME = path.join(scratch, 'config')
  process.env.XDG_STATE_HOME = path.join(scratch, 'state')
  process.env.LOCALAPPDATA = path.join(scratch, 'local')
  process.env.APPDATA = path.join(scratch, 'roaming')
  for (const name of Object.keys(process.env)) if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete process.env[name]
  fs.mkdirSync(process.env.HOME, { recursive: true })
  const { machineAvoozlPaths, WorkspaceRegistry } = await src('host-config.mjs')
  const { workspaceConfig } = await src('config.mjs')
  const { initializeWorkspace } = await src('workspace.mjs')
  const { startServe } = await src('serve-server.mjs')
  const { Store } = await src('store.mjs')
  const { approveHarnessDefinition, harnessDefinitionHash } = await src('harness-definitions.mjs')
  machine = machineAvoozlPaths()
  root = path.join(scratch, 'ws')
  initializeWorkspace(root)
  const registryOptions = { configPath: path.join(machine.configDirectory, 'config.json'), catalogPath: path.join(machine.stateDirectory, 'catalog.sqlite') }
  fs.mkdirSync(machine.configDirectory, { recursive: true })
  const registry = new WorkspaceRegistry(registryOptions)
  registry.add('main', { root, name: 'Scratch' })
  registry.close?.()
  const bytes = JSON.stringify({
    name: 'fake-cli',
    start: ['node', '{brief_file}'],
    resume: ['node', '{message_file}'],
    permission: { write: 'workspace-write', read: 'read-only' },
    writeRoots: ['{worktree}', '{tmp}'],
  })
  fs.mkdirSync(path.join(machine.configDirectory, 'harnesses'), { recursive: true })
  fs.writeFileSync(path.join(machine.configDirectory, 'harnesses', 'fake-cli.json'), bytes)
  approveHarnessDefinition({ configDirectory: machine.configDirectory, name: 'fake-cli', hash: harnessDefinitionHash(Buffer.from(bytes)) })
  const config = workspaceConfig({ workspace: root, env: process.env })
  server = await startServe({ config, uiDir: ui, registryOptions, home: process.env.HOME, demoRoot: path.join(scratch, 'demo'), log: () => {} })
  store = new Store(config.dbPath)
  close = async () => {
    store.close()
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
  await page.open(server.ownerLink, { width: 1280, height: 900, dark: false })
  await page.until(`document.body.innerText.includes('Scratch')`, 20000)
})
after(async () => {
  if (close) await close()
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

const click = (find) => page.evaluate(`(() => { const e = ${find}; if (!e) return false; e.click(); return true })()`)
const button = (text) => `[...document.querySelectorAll('button,[role=tab],a')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
const dialog = (expression) => `(() => { const d = document.querySelector('dialog[data-start-session]'); return d && d.open ? (${expression}) : null })()`
const requests = () => store.list('session_requests')

test('Settings › Content rules › Design a rule set opens Start a session, and Start records one read-only process request (SW7.1, SW7.2)', { skip }, async () => {
  await click(button('Settings'))
  await page.until(`!!(${button('Content rules')})`)
  await click(button('Content rules'))
  await page.until(`!!(${button('Design a rule set')})`, 10000)
  assert.equal(requests().length, 0)
  await click(button('Design a rule set'))
  await page.until(dialog('true'), 5000)
  // The message is in an editable box, with the role and harness it maps to.
  assert.ok((await page.evaluate(dialog(`document.querySelector('[data-session-message]').value.length`))) > 20)
  await page.until(dialog(`document.querySelector('[data-session-plan]')?.textContent.includes('fake-cli')`), 5000)
  const plan = await page.evaluate(dialog(`document.querySelector('[data-session-plan]').textContent`))
  assert.match(plan, /Role assist/)
  assert.match(plan, /read-only/)
  // autoSend is false here and true elsewhere: neither starts anything.
  assert.equal(requests().length, 0, 'nothing starts until Start')
  await click(`[...document.querySelectorAll('dialog[data-start-session] footer button')].find((b) => b.textContent.trim() === 'Start')`)
  await page.until(dialog(`!!document.querySelector('[data-session-state]')`), 5000)
  assert.equal(requests().length, 1)
  const [row] = requests()
  assert.equal(row.executor, 'process')
  assert.equal(row.request.role, 'assist')
  assert.equal(row.request.permissionClass, 'read')
  assert.equal(fs.realpathSync(row.request.worktree), fs.realpathSync(root))
  // The supervisor's drain starts it, and the dialog then shows its process view.
  const { drainProcessRequests } = await src('executors/process.mjs')
  const { Operations } = await src('operations.mjs')
  const ops = new Operations(store, { workspaceRoot: root, configDirectory: machine.configDirectory })
  const drained = await drainProcessRequests(store, { stateDirectory: machine.stateDirectory, ops })
  assert.deepEqual(drained.errors, [])
  await page.until(dialog(`document.querySelector('[data-session-state]')?.textContent.includes('Working')`), 15000)
  assert.ok(await page.evaluate(dialog(`!!document.querySelector('[data-session-log]')`)))
  // Send message queues one more request for the same session.
  await page.evaluate(
    dialog(
      `(() => { const e = document.querySelector('input[aria-label="Message to the session"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, 'And this'); e.dispatchEvent(new Event('input', { bubbles: true })); return true })()`,
    ),
  )
  await click(`[...document.querySelectorAll('dialog[data-start-session] button')].find((b) => b.textContent.trim() === 'Send message')`)
  await new Promise((resolve) => setTimeout(resolve, 600))
  assert.equal(requests().filter((r) => r.kind === 'send').length, 1)
  await click(`[...document.querySelectorAll('dialog[data-start-session] footer button')].find((b) => b.textContent.trim() === 'Close')`)
  await page.until(`!document.querySelector('dialog[data-start-session]').open`, 3000)
})

test('with no approved harness the dialog says so, links to Settings › Models, offers Copy and starts nothing (SW7.5)', { skip }, async () => {
  fs.rmSync(path.join(machine.configDirectory, 'harness-approvals.json'), { force: true })
  const before = requests().length
  await click(button('Design a rule set'))
  await page.until(dialog(`!!document.querySelector('[data-no-harness]')`), 8000)
  const text = await page.evaluate(dialog(`document.querySelector('[data-no-harness]').textContent`))
  assert.match(text, /No harness definition is approved/)
  assert.ok(await page.evaluate(dialog(`!!document.querySelector('[data-no-harness] a[href="/apps/avoozl?settings=models"]')`)))
  const buttons = await page.evaluate(dialog(`[...document.querySelectorAll('footer button')].map((b) => b.textContent.trim())`))
  assert.ok(buttons.includes('Copy message'))
  assert.ok(!buttons.includes('Start'))
  assert.equal(requests().length, before, 'nothing started')
  await click(`[...document.querySelectorAll('dialog[data-start-session] footer button')].find((b) => b.textContent.trim() === 'Close')`)
})

test('a Kiro Crew chat slot says to open it in Kiro Crew (SW7.3)', { skip }, async () => {
  // Open chat for a slot that is not a process session.
  const { bindSession } = await src('session-bindings.mjs')
  store.put('receipts', { id: 'assist:x', kind: 'assist-session', title: 'x' })
  bindSession(store, { slot: 'dashboard:chat-1', taskId: 'assist:x', role: 'assist', executor: 'kirocrew' })
  const view = await fetch(`${server.origin}/apps/avoozl/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(view.status, 401, 'the check above ran without a session')
  const { Operations } = await src('operations.mjs')
  const ops = new Operations(store, { workspaceRoot: root, configDirectory: machine.configDirectory })
  assert.deepEqual(await ops.execute('session.view', { slot: 'dashboard:chat-1' }), { kirocrewChat: true })
})

test('a new Needs you item gives one notice, two give two, and a reload gives none (SW8.2)', { skip }, async () => {
  const fake = `(() => { window.__shown = []; class N { constructor(title) { window.__shown.push(title) } } N.permission = 'granted'; N.requestPermission = async () => 'granted'; window.Notification = N; return true })()`
  await page.evaluate(fake)
  await page.evaluate(`localStorage.setItem('avoozl-notices', 'on'); localStorage.removeItem('avoozl-noticed'); window.dispatchEvent(new Event('avoozl:notices-changed')); true`)
  await page.until(`localStorage.getItem('avoozl-noticed') !== null`, 8000)
  assert.deepEqual(await page.evaluate('window.__shown'), [], 'the backlog is not shown')
  // Two tasks pinned to Kiro Crew wait with a Needs you item each, in a second
  // workspace built from the test fixtures.
  const { snapshot } = await import('../../../src/app/test/fixtures.mjs')
  const { enqueueSessionRequests } = await src('session-requests.mjs')
  const { deliveryPolicy, planReadyDispatches } = await src('delivery.mjs')
  const { workspaceConfig } = await src('config.mjs')
  const { Store } = await src('store.mjs')
  const { WorkspaceRegistry } = await src('host-config.mjs')
  const pinned = (id) => ({
    id,
    title: `Pinned ${id}`,
    kind: 'leaf',
    scope: 'catalog',
    status: 'planned',
    epic: 'sample',
    track: 'catalog',
    tags: [],
    acceptance: ['Works.'],
    repository: 'r1',
    session: { harness: 'kirocrew' },
  })
  const other = path.join(scratch, 'other')
  fs.mkdirSync(other, { recursive: true })
  const second = new Store(workspaceConfig({ workspace: other, env: process.env }).dbPath)
  second.importSnapshot({ ...snapshot(), tasks: [pinned('p1'), pinned('p2')], edges: [] })
  second.put('repositories', { id: 'r1', root: fs.mkdtempSync(path.join(scratch, 'r1-')) })
  const registry = new WorkspaceRegistry({ configPath: path.join(machine.configDirectory, 'config.json'), catalogPath: path.join(machine.stateDirectory, 'catalog.sqlite') })
  registry.add('other', { root: other, name: 'Other' })
  registry.close?.()
  await page.evaluate(`localStorage.setItem('avoozl-noticed', '[]'); localStorage.setItem('avoozl.page', JSON.stringify({ workspaceId: 'other' })); true`)
  enqueueSessionRequests(second, { starts: planReadyDispatches(second, deliveryPolicy({ lanes: { local: 5 }, delivery: {} }), {}) }, { source: 'tick' })
  second.close()
  await page.evaluate(`window.dispatchEvent(new Event('avoozl:notices-changed')); true`)
  await page.until(`window.__shown.length >= 2`, 8000)
  assert.equal((await page.evaluate('window.__shown')).length, 2)
  assert.ok((await page.evaluate('window.__shown')).every((title) => /pinned to Kiro Crew/.test(title)))
  // A reload with the same items gives none.
  await page.open(`${server.origin}/apps/avoozl`, { width: 1280, height: 900, dark: false })
  await page.until(`document.body.innerText.includes('Other')`, 20000)
  await page.evaluate(fake)
  await page.evaluate(`window.dispatchEvent(new Event('avoozl:notices-changed')); true`)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  assert.deepEqual(await page.evaluate('window.__shown'), [])
})

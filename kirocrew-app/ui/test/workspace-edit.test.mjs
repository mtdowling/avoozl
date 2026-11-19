// Settings > Workspaces: the pencil opens a form that edits the workspace's
// name, folder, agents at once, on/off and default, with Save and Cancel.
// Save sends only what changed (workspaces.update). The Add and Edit folder
// fields have a Browse list of folders under home (workspaces.browse).
// The browser tests are skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const { editChanges, editDraft } = await import('../src/workspace-api.ts')

test('Save sends only the changed fields and checks the form first', () => {
  const ws = { id: 'launch', name: 'Launch', root: '/plans/launch', enabled: true, state: 'closed', served: true }
  const draft = editDraft(ws, false)
  assert.deepEqual(editChanges(ws, false, draft), { change: null, error: null }, 'nothing changed')
  assert.deepEqual(editChanges(ws, false, { ...draft, name: ' New ', root: '~/plans/launch', enabled: false, default: true }).change, {
    id: 'launch',
    name: 'New',
    root: '~/plans/launch',
    enabled: false,
    default: true,
  })
  for (const [field, value, error] of [
    ['name', '  ', /name/],
    ['name', 'x'.repeat(161), /160/],
    ['root', '', /folder/],
    ['root', 'relative/path', /full path/],
  ])
    assert.match(editChanges(ws, false, { ...draft, [field]: value }).error ?? '', error, `${field}=${value}`)
  assert.equal(editChanges(ws, false, { ...draft, root: 'C:\\plans' }).error, null, 'a Windows path')
  assert.equal(editChanges(ws, true, { ...draft, default: true }).change, null, 'already the default')
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the workspace edit tests'
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
const wait = (ms = 250) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
// React's own value setter, so its onChange fires.
const type = (selector, value) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
const value = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).value`)
const saveDisabled = () => page.evaluate(`document.querySelector('[data-edit-save]').disabled`)

async function openEdit() {
  await page.open(harness.url({ page: 'workspaces', theme: 'light' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-edit-workspace="launch"]'))`)
  await click('[data-edit-workspace="launch"]')
  await page.until(`Boolean(document.querySelector('[data-edit-workspace-modal] [data-edit-form]'))`)
  await wait()
}

test('the pencil edits the name and picks a folder with Browse; Save sends the change', { skip }, async () => {
  await openEdit()
  // No "Agents at once": nothing enforced it; lanes are a machine setting (R6.3).
  assert.equal(await page.evaluate(`Boolean(document.querySelector('#avoozl-ws-edit-limit'))`), false)
  assert.equal(await value('#avoozl-ws-edit-name'), 'Product launch')
  assert.equal(await value('#avoozl-ws-edit-root'), '/plans/launch')
  assert.equal(await saveDisabled(), true, 'nothing to save yet')
  await type('#avoozl-ws-edit-name', 'Launch plans')
  await wait()
  assert.equal(await saveDisabled(), false)
  // Browse: /plans/launch is not in home, so it starts at home.
  await click('#avoozl-ws-edit-root ~ [data-folder-browse]')
  await page.until(`document.querySelector('[data-folder-at]')?.textContent === '/me'`)
  await click('[data-folder="plans"]')
  await page.until(`document.querySelector('[data-folder-at]')?.textContent === '/me/plans'`)
  await click('[data-folder="launch"]')
  await page.until(`document.querySelector('#avoozl-ws-edit-root').value === '/me/plans/launch'`)
  await click('[data-folder-done]')
  await click('[data-edit-save]')
  await page.until(`!document.querySelector('[data-edit-workspace-modal]')`)
  assert.deepEqual(await page.evaluate('window.__wsCalls'), [`update launch ${JSON.stringify({ name: 'Launch plans', root: '/me/plans/launch' })}`])
  assert.match(await page.evaluate(`document.querySelector('[data-edit-workspace="launch"]').closest('li').textContent`), /Launch plans/)
  assert.deepEqual(page.errors, [])
})

test('a bad form keeps Save off and says why; a refused save shows the backend error; Close sends nothing', { skip }, async () => {
  await openEdit()
  await type('#avoozl-ws-edit-name', '')
  await wait()
  assert.equal(await saveDisabled(), true)
  assert.match(await page.evaluate(`document.querySelector('[data-edit-error]').textContent`), /Give the workspace a name/)
  await type('#avoozl-ws-edit-name', 'Product launch')
  await type('#avoozl-ws-edit-root', '/bad')
  await wait()
  await click('[data-edit-save]')
  await page.until(`/No Avoozl workspace/.test(document.querySelector('[data-edit-workspace-modal] [role="alert"]')?.textContent ?? '')`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-edit-workspace-modal]'))`), true, 'the dialog stays open')
  await page.evaluate('window.__wsCalls.length = 0')
  await type('#avoozl-ws-edit-root', '/plans/launch')
  await wait()
  await click('[data-edit-workspace-modal] [data-modal-footer-close]')
  await page.until(`!document.querySelector('[data-edit-workspace-modal]')`)
  assert.deepEqual(await page.evaluate('window.__wsCalls'), [])
})

test('the Add dialog has the same Browse, and the typed path stays', { skip }, async () => {
  await page.open(harness.url({ page: 'workspaces', theme: 'light' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-add-workspace]'))`)
  await click('[data-add-workspace]')
  await page.until(`Boolean(document.querySelector('#avoozl-ws-root'))`)
  await type('#avoozl-ws-root', '~/plans')
  await click('#avoozl-ws-root ~ [data-folder-browse]')
  await page.until(`document.querySelector('[data-folder-at]')?.textContent === '/me/plans'`)
  assert.equal(await value('#avoozl-ws-root'), '~/plans', 'opening Browse keeps what was typed')
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-folder]')].map((b) => b.dataset.folder)`), ['launch', 'nupp'])
  await click('[data-folder-up]')
  await page.until(`document.querySelector('#avoozl-ws-root').value === '/me'`)
  assert.equal(await page.evaluate(`document.querySelector('[data-folder-up]').disabled`), true, 'no Up from home')
})

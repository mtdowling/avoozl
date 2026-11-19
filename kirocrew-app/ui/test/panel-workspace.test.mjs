// Which workspace the side panel reads, and its name in the panel's top row.
// The rules run in node; the panel itself runs in a real Chrome on the
// harness page (?page=panel&places=1), skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const { chatProject, insideRoot, pickPanelWorkspace } = await import('../src/panel-api.ts')

const workspaces = [
  { id: 'avoozl', root: '/plans/avoozl', roots: ['/src/avoozl'] },
  { id: 'nupp', root: '/plans/nupp', roots: ['/src/nupp'] },
  // A repository inside another one's checkout: the longer root wins.
  { id: 'nupp-std', root: '/plans/std', roots: ['/src/nupp/std'] },
]
const pick = (input) => pickPanelWorkspace({ project: null, workspaces, last: null, fallback: null, ...input })

test("the chat's project folder picks the workspace whose root or repository holds it", () => {
  assert.deepEqual(pick({ project: '/src/avoozl/kirocrew-app', last: 'nupp' }), { id: 'avoozl', why: 'folder' })
  assert.deepEqual(pick({ project: '/plans/nupp' }), { id: 'nupp', why: 'folder' }, 'the workspace root itself')
  assert.deepEqual(pick({ project: '/src/nupp/compiler' }), { id: 'nupp', why: 'folder' })
})

test('the longest matching root wins', () => {
  assert.deepEqual(pick({ project: '/src/nupp/std/io' }), { id: 'nupp-std', why: 'folder' })
})

test('a folder in no workspace falls back to the page\u2019s last workspace, then the default', () => {
  assert.deepEqual(pick({ project: '/srv/else', last: 'nupp', fallback: 'avoozl' }), { id: 'nupp', why: 'last' })
  assert.deepEqual(pick({ project: null, last: 'gone', fallback: 'avoozl' }), { id: 'avoozl', why: 'default' }, 'a last workspace no longer listed does not count')
  assert.deepEqual(pick({ last: null, fallback: null }), { id: null, why: 'none' })
})

test('inside a root means the root or a folder under it, not a sibling with the same prefix', () => {
  assert.equal(insideRoot('/src/nupp', '/src/nupp/'), true)
  assert.equal(insideRoot('C:\\src\\nupp\\a', 'C:/src/nupp'), true)
  assert.equal(insideRoot('/src/nupp-old/a', '/src/nupp'), false)
  assert.equal(insideRoot('/src/nupp', ''), false)
})

test("the chat's folder comes from the slot list, and a refused read gives none", async () => {
  const api = (rows) => ({ get: async (path) => (assert.equal(path, '/api/chat/slots'), rows) })
  assert.equal(
    await chatProject(
      api([
        { key: 'a', project: '/x' },
        { key: 'b', project: '/y' },
      ]),
      'b',
    ),
    '/y',
  )
  assert.equal(await chatProject(api([{ key: 'a', project: '' }]), 'a'), null)
  assert.equal(await chatProject(api([]), 'a'), null)
  assert.equal(
    await chatProject(
      {
        get: async () => {
          throw new Error('[app-sdk] App "avoozl" not permitted to access /api/chat/slots')
        },
      },
      'a',
    ),
    null,
  )
  assert.equal(await chatProject(api([]), ''), null)
})

test('the panel never writes the page\u2019s saved workspace', () => {
  const panel = readFileSync(new URL('../src/Panel.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(panel, /writePageState|PAGE_STATE_KEY|'avoozl\.page'/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the panel workspace tests'
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

const HEAD = `(() => {
  const head = document.querySelector('[data-pp-head-name]'), ws = document.querySelector('[data-pp-head-workspace]')
  const shown = (el) => Boolean(el) && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0
  return {
    workspace: ws ? ws.textContent.replace(/^·\\s*/, '').trim() : null,
    brand: shown(document.querySelector('[data-pp-head-brand]')),
    dot: shown(document.querySelector('[data-pp-head-dot]')),
    ellipsis: ws ? getComputedStyle(ws).textOverflow : null,
    fits: head ? head.scrollWidth <= head.clientWidth + 1 || (ws && ws.scrollWidth > ws.clientWidth) : false,
    saved: localStorage.getItem('avoozl.page'),
  }
})()`

async function open(sid, { width = 1280, last = null } = {}) {
  await page.open(harness.url({ page: 'panel', sid, places: '1' }), { width, height: 800 })
  await page.evaluate(last ? `localStorage.setItem('avoozl.page', JSON.stringify({ workspaceId: ${JSON.stringify(last)} })), true` : `localStorage.removeItem('avoozl.page'), true`)
  await page.open(harness.url({ page: 'panel', sid, places: '1' }), { width, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-pp-head-workspace]'))`)
  await page.evaluate('new Promise((r) => setTimeout(r, 400))')
  return page.evaluate(HEAD)
}

test('a Nupp chat and an Avoozl chat each read their own workspace, named in the top row', { skip }, async () => {
  const nupp = await open('nupp-chat', { last: 'w' })
  assert.equal(nupp.workspace, 'Nupp plans with a long name')
  assert.equal(nupp.brand, true, 'Avoozl and the instance show beside it')
  assert.equal(nupp.ellipsis, 'ellipsis', 'a long name truncates')
  assert.equal(nupp.saved, JSON.stringify({ workspaceId: 'w' }), "the page's saved workspace is untouched")
  const avoozl = await open('avoozl-chat', { last: 'nupp' })
  assert.equal(avoozl.workspace, 'Avoozl plans')
  assert.equal(avoozl.saved, JSON.stringify({ workspaceId: 'nupp' }))
  // A chat whose folder is in no workspace reads the page's last one.
  assert.equal((await open('elsewhere-chat', { last: 'nupp' })).workspace, 'Nupp plans with a long name')
  assert.deepEqual(page.errors, [])
})

test('on a phone the top row shows the workspace alone', { skip }, async () => {
  const got = await open('nupp-chat', { width: 390 })
  assert.equal(got.workspace, 'Nupp plans with a long name')
  assert.equal(got.brand, false, 'no Avoozl or instance')
  assert.equal(got.dot, false, 'no leading dot')
})

// rc-2.5: the Project to GitHub modal and the Spec changed modal. Inputs
// checked: a preview with and without batches chosen; Cancel, Esc and Back
// before the confirm (no write); Create issues (held) and Create and release
// (one write each, after the confirm); a spec not yet approved again (apply
// off); a claimed row (comment only); drawn at 320, 768 and 1280 px, light
// and dark, with no sideways scroll. The browser parts skip without Chrome.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { COMMAND_PATH } from '../src/workspace-api.ts'
import { ACTION_LABEL, confirmLines, headline, projectionClient, toggleBatch, writing } from '../src/projection-api.ts'

const write = (kind, extra = {}) => ({ kind, repository: 'example/app', taskId: 't', issue: null, ...extra })
const preview = (writes) => ({ planId: 'p', planHash: 'h', writes, conflicts: [], notes: [], previewOnly: [], project: { status: 'off' } })

test('the client sends each call to its own operation, and only create writes', async () => {
  const calls = []
  const api = { post: async (path, body) => (calls.push([path, body]), { result: {} }) }
  const client = projectionClient(api)
  await client.preview('w', 'p', [['a', 'b']])
  await client.changed('w', 'p')
  assert.deepEqual(
    calls.map(([path, body]) => [path, body.operation]),
    [[COMMAND_PATH, 'plan.issues.preview'], [COMMAND_PATH, 'spec.changed.preview']],
  )
  assert.deepEqual(calls[0][1].input, { planId: 'p', batches: [['a', 'b']] })
  await client.create('w', 'p', [], false)
  await client.create('w', 'p', [['a', 'b']], true)
  await client.apply('w', 'p')
  assert.deepEqual(calls.slice(2).map(([, body]) => [body.operation, body.input.release ?? false]), [
    ['github.project', false],
    ['github.project', true],
    ['spec.changed.apply', false],
  ])
})

test('the confirm lists every kind of write that will happen, and no zero counts', () => {
  const data = preview([write('issue.create'), write('issue.create'), write('blocker.add'), write('project.add'), write('project.add')])
  assert.deepEqual(confirmLines(data, 'example/app', false), ['create 2 issues in example/app', 'add 1 blocked-by link', 'add 2 issues to the Project'])
  assert.equal(confirmLines(data, null, true).at(-1), 'check the merge path, then release by your release mode')
  assert.deepEqual(confirmLines(preview([]), null, false), [])
})

test('the headline counts issues and batched tasks', () => {
  const data = preview([write('issue.create')])
  assert.match(headline(data, []), /^1 issue to create\. Nothing is written until you confirm\.$/)
  assert.match(headline(data, [['a', 'b', 'c']]), /3 tasks batched into 1 issue/)
})

test('a batch toggles on and off by its task IDs', () => {
  const group = ['a', 'b']
  assert.deepEqual(toggleBatch([], group), [group])
  assert.deepEqual(toggleBatch([group], group), [])
  assert.deepEqual(toggleBatch([['c', 'd']], group), [['c', 'd'], group])
})

test('every action the backend names has a label, and none writes counts as nothing', () => {
  assert.deepEqual(Object.keys(ACTION_LABEL).sort(), ['close', 'comment', 'create', 'none', 'update'])
  assert.equal(writing([{ action: 'none' }, { action: 'comment' }]).length, 1)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the browser tests'
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

const button = (label) => `[...document.querySelectorAll('dialog button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`
const calls = () => page.evaluate('window.__harness.calls.map((c) => c.operation)')
async function openModal(name, extra = {}) {
  await page.open(harness.url({ modal: name, ...extra }), { width: 1280, height: 800 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
}
const enabled = (label) => `(() => { const b = ${button(label)}; return Boolean(b) && !b.disabled })()`

test('nothing is written before the confirm; each create button writes once', { skip }, async () => {
  await openModal('projection')
  await page.until(enabled('Create issues (held)…'))
  assert.deepEqual(await calls(), ['plan.issues.preview'])
  // Choosing a batch previews again with it; still no write.
  await page.evaluate(`document.querySelector('[data-batches] input').click()`)
  await page.until(`window.__harness.calls.length === 2 && ${enabled('Create issues (held)…')}`)
  assert.deepEqual(await page.evaluate('window.__harness.calls[1].input.batches'), [['S1', 'S2', 'S3']])
  assert.match(await page.evaluate(`document.querySelector('[data-projection-dialog]').textContent`), /3 tasks batched into 1 issue/)
  // Step 2 is the confirm. Back goes to step 1. Neither writes.
  await page.evaluate(`${button('Create issues (held)…')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-confirm]'))`)
  assert.match(await page.evaluate(`document.querySelector('[data-confirm]').textContent`), /create 3 issues in example\/recipe-box/)
  assert.match(await page.evaluate(`document.querySelector('[data-confirm]').textContent`), /close the issues as not planned/)
  await page.evaluate(`${button('Back')}.click()`)
  await page.until(`!document.querySelector('[data-confirm]')`)
  assert.equal((await calls()).includes('github.project'), false)
  // Cancel writes nothing.
  await page.evaluate(`${button('Cancel')}.click()`)
  await page.until(`!document.querySelector('dialog')`)
  assert.equal((await calls()).includes('github.project'), false)

  // Confirmed: one write, without release.
  await openModal('projection')
  await page.until(enabled('Create issues (held)…'))
  await page.evaluate(`${button('Create issues (held)…')}.click()`)
  await page.until(`Boolean(${button('Create issues (held)')})`)
  await page.evaluate(`${button('Create issues (held)')}.click()`)
  await page.until(`!document.querySelector('dialog')`)
  const written = await page.evaluate(`window.__harness.calls.filter((c) => c.operation === 'github.project').map((c) => c.input)`)
  assert.deepEqual(written, [{ planId: 'search-v2', batches: [] }])

  // Create and release asks for release.
  await openModal('projection')
  await page.until(enabled('Create and release…'))
  await page.evaluate(`${button('Create and release…')}.click()`)
  await page.until(`Boolean(${button('Create and release')})`)
  await page.evaluate(`${button('Create and release')}.click()`)
  await page.until(`!document.querySelector('dialog')`)
  const last = await page.evaluate(`window.__harness.calls.filter((c) => c.operation === 'github.project').at(-1).input`)
  assert.deepEqual(last, { planId: 'search-v2', batches: [], release: true })
  assert.deepEqual(page.errors, [])
})

test('Esc before the confirm writes nothing', { skip }, async () => {
  await openModal('projection')
  await page.until(enabled('Create issues (held)…'))
  await page.key('Escape')
  await page.until(`!document.querySelector('dialog')`)
  assert.equal((await calls()).includes('github.project'), false)
})

test('Spec changed writes nothing until applied, and apply is off until approved again', { skip }, async () => {
  await openModal('spec-changed', { approved: '0' })
  await page.until(`document.querySelectorAll('[data-change-rows] li').length === 4`)
  assert.equal(await page.evaluate(`${button('Approve change and apply')}.disabled`), true)
  assert.match(await page.evaluate(`document.querySelector('dialog').textContent`), /Approve the spec again at this revision first/)
  const text = await page.evaluate(`document.querySelector('[data-change-rows]').textContent`)
  assert.match(text, /S5.*claimed · Comment only/s)
  assert.match(text, /S12.*Close as not planned/s)
  await page.evaluate(`${button('Later')}.click()`)
  await page.until(`!document.querySelector('dialog')`)
  assert.equal((await calls()).includes('spec.changed.apply'), false)

  await openModal('spec-changed')
  await page.until(enabled('Approve change and apply'))
  await page.evaluate(`${button('Approve change and apply')}.click()`)
  await page.until(`!document.querySelector('dialog')`)
  assert.equal((await calls()).filter((operation) => operation === 'spec.changed.apply').length, 1)
})

for (const name of ['projection', 'spec-changed'])
  for (const width of [320, 768, 1280])
    for (const dark of [false, true])
      test(`${name} is drawn at ${width} px ${dark ? 'dark' : 'light'} with no sideways scroll`, { skip }, async () => {
        await page.open(harness.url({ page: name, theme: dark ? 'dark' : 'light' }), { width, height: 800, dark })
        await page.until(`Boolean(document.querySelector('dialog button:not([disabled])')) && document.querySelector('dialog').textContent.length > 120`)
        const fit = await page.evaluate(`(() => {
          const box = document.querySelector('[data-modal-box]')
          const body = box.querySelector('.overflow-y-auto')
          const r = box.getBoundingClientRect()
          return { sideways: body.scrollWidth > body.clientWidth, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, text: getComputedStyle(box).color !== getComputedStyle(box).backgroundColor }
        })()`)
        assert.deepEqual(fit, { sideways: false, inside: true, text: true })
      })

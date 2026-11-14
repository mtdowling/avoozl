// rc-9.3 and rc-13: the quick goal modal. Inputs checked: nothing written
// before the confirm step's button; a one-task proposal (hint and Plan it
// anyway, which goes on to the confirm); a three-task proposal (no hint); a
// goal over a promote rule (no Approve, Promote works); Discard; Edit; the
// scope statement from the one source string; drawn at 320, 768 and 1280 px,
// light and dark. The browser parts skip without Chrome.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { SCOPE_RULE, SCOPE_STATEMENT } from '../../../src/work-split.mjs'
import { approvedText, endedText, evidenceText, quickGoalClient, waitsOn } from '../src/quickgoal-api.ts'

const task = (id) => ({ id, title: id, evidence: { file: 'a.mjs', line: 3 } })

test('the client calls each operation by name; only approve writes to GitHub', async () => {
  const calls = []
  const client = quickGoalClient({ post: async (_path, body) => (calls.push(body.operation), { result: {} }) })
  await client.propose('w', { goal: 'g', repository: 'o/r', depth: 'look', budget: { turns: 1, minutes: 1 } })
  await client.edit('w', 'qg_x', { remove: [], titles: {} })
  await client.confirm('w', 'qg_x')
  await client.promote('w', 'qg_x')
  await client.discard('w', 'qg_x')
  await client.waiting('w')
  await client.approve('w', 'qg_x')
  assert.deepEqual(calls, ['quickgoal.propose', 'quickgoal.edit', 'quickgoal.confirm', 'quickgoal.promote', 'quickgoal.discard', 'quickgoal.list', 'quickgoal.approve'])
})

test('words for evidence, order, an ended chat and an open pull request', () => {
  assert.equal(evidenceText(task('A')), 'a.mjs:3')
  assert.equal(evidenceText({ id: 'A', title: 't', evidence: { measured: { seconds: 8, command: 'npm test' } } }), 'measured 8 s with npm test')
  assert.deepEqual(waitsOn({ edges: [{ from: 'A', to: 'B' }] }, 'B'), ['A'])
  assert.match(endedText({ status: 'stopped', reason: 'time', turns: 4 }), /ran out of time after 4 turns/)
  assert.match(endedText({ status: 'refused', reason: 'No tasks.', turns: 1 }), /refused: No tasks\./)
  assert.match(approvedText({ status: 'approving', pull: { number: 7, repository: 'o/r' } }), /#7 is open in o\/r/)
  assert.match(approvedText({ status: 'approved' }), /Approved/)
})

test('the scope statement comes from the one source string, in all three places', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
  assert.match(read('../src/QuickGoalModal.tsx'), /SCOPE_STATEMENT/)
  assert.match(read('../src/SetupWizard.tsx'), /SCOPE_STATEMENT/)
  assert.ok(read('../../../README.md').includes(`${SCOPE_STATEMENT} ${SCOPE_RULE}`))
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
const names = () => page.evaluate('window.__harness.calls.map((c) => c.operation)')
async function start(extra = {}) {
  await page.open(harness.url({ modal: 'quick-goal', ...extra }), { width: 1280, height: 800 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`Boolean(document.querySelector('dialog textarea'))`)
}
async function investigate() {
  await page.evaluate(`(() => { const t = document.querySelector('dialog textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Make tests faster'); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await page.until(`!${button('Investigate')}.disabled`)
  await page.evaluate(`${button('Investigate')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-proposal]'))`)
}

test('the ask step shows the scope statement and writes nothing', { skip }, async () => {
  await start()
  const text = await page.evaluate(`document.querySelector('[data-scope]').textContent`)
  assert.equal(text, `${SCOPE_STATEMENT} ${SCOPE_RULE}`)
  assert.equal(await page.evaluate(`document.querySelector('[data-auto-approve] input').checked`), false)
  assert.deepEqual(await names(), [])
})

test('a three-task proposal has no hint; nothing is written until the confirm button', { skip }, async () => {
  await start()
  await investigate()
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-hint]'))`), false)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-tasks] li').length`), 3)
  await page.evaluate(`${button('Approve…')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-confirm]'))`)
  const listed = await page.evaluate(`document.querySelector('[data-confirm]').textContent`)
  assert.match(listed, /3 issues/)
  assert.match(listed, /goal-make-tests-faster\.2/)
  assert.deepEqual(await names(), ['quickgoal.propose', 'quickgoal.confirm'])
  await page.evaluate(`${button('Back')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-proposal]'))`)
  assert.equal((await names()).includes('quickgoal.approve'), false)
  await page.evaluate(`${button('Approve…')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-confirm]'))`)
  await page.evaluate(`${button('Approve and open the pull request')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-done]'))`)
  assert.equal((await names()).filter((name) => name === 'quickgoal.approve').length, 1)
  assert.match(await page.evaluate(`document.querySelector('[data-done]').textContent`), /#7 is open/)
})

test('a one-task proposal shows the hint, and Plan it anyway still plans', { skip }, async () => {
  await start({ tasks: '1' })
  await investigate()
  assert.match(await page.evaluate(`document.querySelector('[data-hint]').textContent`), /This fits one pull request\. A crew or your coder can take it without a plan\./)
  await page.evaluate(`${button('Plan it anyway')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-confirm]'))`)
  await page.evaluate(`${button('Approve and open the pull request')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-done]'))`)
  assert.equal((await names()).filter((name) => name === 'quickgoal.approve').length, 1)
})

test('a goal over a promote rule offers Promote, not Approve', { skip }, async () => {
  await start({ big: '1' })
  await investigate()
  assert.equal(await page.evaluate(`Boolean(${button('Approve…')})`), false)
  assert.match(await page.evaluate(`document.querySelector('[data-promote]').textContent`), /changes a public interface/)
  await page.evaluate(`${button('Promote to spec')}.click()`)
  await page.until(`!document.querySelector('dialog')`)
  assert.deepEqual(await names(), ['quickgoal.propose', 'quickgoal.promote'])
})

test('Edit sends removals and titles; Discard writes nothing to GitHub', { skip }, async () => {
  await start()
  await investigate()
  await page.evaluate(`${button('Edit')}.click()`)
  await page.until(`Boolean(document.querySelector('[data-tasks] input[type=checkbox]'))`)
  await page.evaluate(`document.querySelector('[data-tasks] input[type=checkbox]').click()`)
  await page.evaluate(`${button('Save changes')}.click()`)
  await page.until(`window.__harness.calls.some((c) => c.operation === 'quickgoal.edit')`)
  assert.deepEqual(await page.evaluate(`window.__harness.calls.find((c) => c.operation === 'quickgoal.edit').input`), { id: 'qg_aaaaaaaaaaaa', remove: ['A'], titles: {} })
  await page.until(`Boolean(${button('Discard')})`)
  await page.evaluate(`${button('Discard')}.click()`)
  await page.until(`!document.querySelector('dialog')`)
  assert.equal((await names()).includes('quickgoal.approve'), false)
})

for (const width of [320, 768, 1280])
  for (const dark of [false, true])
    test(`the quick goal modal is drawn at ${width} px ${dark ? 'dark' : 'light'} with no sideways scroll`, { skip }, async () => {
      await page.open(harness.url({ page: 'quick-goal', theme: dark ? 'dark' : 'light' }), { width, height: 800, dark })
      await page.until(`Boolean(document.querySelector('dialog textarea'))`)
      const fit = () => `(() => {
        const box = document.querySelector('[data-modal-box]')
        const body = box.querySelector('.overflow-y-auto')
        const r = box.getBoundingClientRect()
        return { sideways: body.scrollWidth > body.clientWidth, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }
      })()`
      assert.deepEqual(await page.evaluate(fit()), { sideways: false, inside: true })
      await investigate()
      assert.deepEqual(await page.evaluate(fit()), { sideways: false, inside: true })
    })

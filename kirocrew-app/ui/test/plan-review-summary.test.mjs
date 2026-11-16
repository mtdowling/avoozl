import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found'
let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({ entry: fileURLToPath(new URL('./browser/plan-review-summary.tsx', import.meta.url)) })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => { await browser?.close(); harness?.remove() })
const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
async function open(mode, state = 'done', width = 1280, dark = false) {
  await page.open(harness.url({ mode, state, theme: dark ? 'dark' : 'light' }), { width, height: 900, dark })
  await page.until(`Boolean(document.querySelector('[data-plan-review-state]'))`)
}

for (const [width, dark] of [[1280, false], [390, true]])
  test(`single and batch approval show model, revision, counts, evidence and planner answers at ${width}`, { skip }, async () => {
    for (const mode of ['single', 'batch']) {
      await open(mode, 'done', width, dark)
      assert.equal(await page.evaluate(`document.activeElement?.textContent`), 'Cancel', 'focus starts on Cancel')
      assert.equal(await page.evaluate(`document.querySelector('[data-modal-body]').scrollTop`), 0, 'the review overview starts in view')
      const text = await page.evaluate(`document.querySelector('[data-approve-spec], [data-approve-specs]').textContent`)
      assert.match(text, /fake-reviewer/)
      assert.match(text, /aaaaaaaa/)
      assert.match(text, /2 found · 0 fixed · 2 for you/)
      assert.match(text, /design.md:7/)
      assert.match(text, /The referenced helper does not exist/)
      assert.match(text, /Searched src\/ at the recorded commit/)
      assert.match(text, /The existing loader covers this case/)
      assert.match(text, /Planner has not answered/)
      if (mode === 'batch') for (const label of ['Reviewed at an older revision', 'Review running', 'Review skipped', 'Not reviewed']) assert.ok(text.includes(label), label)
      assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'no page overflow')
      assert.deepEqual(page.errors, [])
    }
  })

test('single Approve stays enabled for all review states and sends the shown exact hash', { skip }, async () => {
  for (const state of ['done', 'older', 'running', 'skipped', 'not-reviewed']) {
    await open('single', state)
    assert.equal(await page.evaluate(`document.querySelector('[data-approve-spec-go]').disabled`), false)
    await click('[data-approve-spec-go]')
    await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
    const calls = await page.evaluate('window.__reviewCalls')
    assert.deepEqual(calls[0], { operation: 'plan.approve', id: state, expectedHash: 'a'.repeat(64) })
  }
})

test('closing a finding records the chosen disposition and approval remains a separate action', { skip }, async () => {
  await open('single')
  await page.evaluate(`(() => { const select = document.querySelector('[data-review-finding="done-answered"] select'); select.value = 'deferred'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`)
  await click('[data-close-review="done-answered"]')
  await page.until(`!document.querySelector('[data-review-finding="done-answered"]')`)
  assert.deepEqual(await page.evaluate('window.__reviewCalls'), [{ operation: 'plan.review.dispose', id: 'done-answered', disposition: 'deferred' }])
  assert.match(await page.evaluate(`document.querySelector('[data-review-counts]').textContent`), /2 found · 0 fixed · 1 for you/)
  assert.equal(await page.evaluate(`document.querySelector('[data-approve-spec-go]').disabled`), false)
  await click('[data-approve-spec-go]')
  await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
})

test('batch Approve ignores open and skipped reviews, while Cancel approves nothing', { skip }, async () => {
  await open('batch')
  assert.equal(await page.evaluate(`document.querySelector('[data-approve-specs-go]').disabled`), false)
  await click('[data-approve-specs-go]')
  await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
  const calls = await page.evaluate('window.__reviewCalls')
  assert.equal(calls[0].operation, 'plan.approveMany')
  assert.equal(calls[0].items.length, 5)
  assert.ok(calls[0].items.every((item) => item.expectedHash === 'a'.repeat(64)))
  await open('single')
  await page.evaluate(`[...document.querySelectorAll('[data-modal-footer] button')].find((button) => button.textContent === 'Cancel').click()`)
  await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
  assert.deepEqual(await page.evaluate('window.__reviewCalls'), [{ done: null }])
})

test('switching workspaces dismisses the opened approval even when IDs and hashes match', { skip }, async () => {
  await page.open(harness.url({ mode: 'workspace' }), { width: 1280, height: 900 })
  const select = '[data-plan-row="spec:shared-spec"]'
  const approve = '[data-spec-primary="approve"]'
  await page.until(`Boolean(document.querySelector(${JSON.stringify(select)}))`)
  await click(select)
  await page.until(`Boolean(document.querySelector(${JSON.stringify(approve)}))`)
  await click(approve)
  await page.until(`Boolean(document.querySelector('[data-approve-spec-go]'))`)
  await page.evaluate(`window.__setReviewWorkspace('second')`)
  await page.until(`!document.querySelector('[data-approve-spec]')`)
  assert.deepEqual(await page.evaluate('window.__reviewCalls'), [], 'switching cannot approve the old plan in the new workspace')
  await page.evaluate(`window.__setReviewWorkspace('first')`)
  await page.until(`Boolean(document.querySelector(${JSON.stringify(select)}))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-approve-spec]'))`), false, 'returning does not reopen the old approval')
  assert.deepEqual(page.errors, [])
})

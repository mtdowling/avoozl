// @ts-nocheck: typing debt
// The Approve dialog: it approves the exact revision it shows, follows a
// revision written while it is open, and shows the diff since the approved
// revision. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.ts'
import { findChrome, launch } from './browser/chrome.ts'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found'
let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({ entry: fileURLToPath(new URL('./browser/approve-spec.tsx', import.meta.url)) })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})
const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const calls = () => page.evaluate('window.__approveCalls')
async function open(width = 1280, dark = false) {
  await page.open(harness.url({ theme: dark ? 'dark' : 'light' }), { width, height: 900, dark })
  await page.until(`Boolean(document.querySelector('[data-approve-spec-go]'))`)
}

test('Approve sends the shown exact hash, and focus starts on Cancel', { skip }, async () => {
  await open()
  assert.equal(await page.evaluate(`document.activeElement?.textContent`), 'Cancel')
  assert.match(await page.evaluate(`document.querySelector('[data-approve-spec]').textContent`), /aaaaaaaa/)
  await click('[data-approve-spec-go]')
  await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
  assert.deepEqual((await calls())[0], { operation: 'plan.approve', id: 'spec', expectedHash: 'a'.repeat(64) })
})

test('a revision written while the dialog is open updates it in place and resets Approve', { skip }, async () => {
  for (const [width, dark] of [
    [1280, false],
    [390, true],
  ]) {
    await open(width, dark)
    await page.evaluate(`window.__moveRevision('spec')`)
    await page.until(`Boolean(document.querySelector('[data-revision-moved]'))`, 10000)
    const text = await page.evaluate(`document.querySelector('[data-revision-moved]').textContent`)
    assert.match(text, /Changed while open: a{12,} → c{12,}/)
    assert.match(text, /requirements\.md \+1 −1/)
    assert.match(text, /tasks\.md \+1 −0/)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    assert.equal(
      (await calls()).some((call) => call.operation === 'plan.approve'),
      false,
      'nothing approved without a click',
    )
    await click('[data-approve-spec-go]')
    await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
    assert.deepEqual(
      (await calls()).find((call) => call.operation === 'plan.approve'),
      { operation: 'plan.approve', id: 'spec', expectedHash: 'c'.repeat(64) },
    )
    assert.deepEqual(page.errors, [])
  }
})

test('an approve sent for the old hash shows the update instead of a changed error', { skip }, async () => {
  await open()
  await page.evaluate(`window.__moveRevision('spec')`)
  await click('[data-approve-spec-go]')
  await page.until(`Boolean(document.querySelector('[data-revision-moved]'))`, 10000)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[role="alert"]'))`), false)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-dialog-closed]'))`), false, 'the stale click approved nothing')
  await click('[data-approve-spec-go]')
  await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
  assert.deepEqual(
    (await calls()).find((call) => call.operation === 'plan.approve'),
    { operation: 'plan.approve', id: 'spec', expectedHash: 'c'.repeat(64) },
  )
})

test('Cancel approves nothing', { skip }, async () => {
  await open()
  await page.evaluate(`[...document.querySelectorAll('[data-modal-footer] button')].find((button) => button.textContent === 'Cancel').click()`)
  await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
  assert.deepEqual(await calls(), [{ done: null }])
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
  await page.evaluate(`window.__setWorkspace('second')`)
  await page.until(`!document.querySelector('[data-approve-spec]')`)
  assert.deepEqual(await calls(), [], 'switching cannot approve the old plan in the new workspace')
  await page.evaluate(`window.__setWorkspace('first')`)
  await page.until(`Boolean(document.querySelector(${JSON.stringify(select)}))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-approve-spec]'))`), false, 'returning does not reopen the old approval')
  assert.deepEqual(page.errors, [])
})

test('the revision opens its diff since the approved revision', { skip }, async () => {
  for (const [width, dark] of [
    [1280, false],
    [390, true],
  ]) {
    await open(width, dark)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-revision-diff]'))`), false)
    await click('[data-revision-diff-toggle]')
    await page.until(`Boolean(document.querySelector('[data-revision-diff]'))`)
    const text = await page.evaluate(`document.querySelector('[data-revision-diff]').textContent`)
    assert.match(text, /approved revision bbbbbbbb/)
    assert.match(text, /requirements\.md/)
    assert.match(text, /-Old goal\./)
    assert.match(text, /\+New goal\./)
    assert.doesNotMatch(text, /tasks\.md/, 'unchanged files are left out')
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    assert.deepEqual(page.errors, [])
  }
})

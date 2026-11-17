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
      assert.match(text, /1 warn · 1 info · 2 for you/)
      assert.doesNotMatch(text, /The referenced helper does not exist/, 'findings are read in the Review view, not listed here')
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-modal-body] select, [data-close-review]').length`), 0, 'no close controls')
      assert.ok(await page.evaluate(`Boolean(document.querySelector('[data-open-review]'))`), 'Open review')
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

test('Open review opens the Review view at the shown revision, apart from approving', { skip }, async () => {
  for (const mode of ['single', 'batch']) {
    await open(mode)
    assert.equal(await page.evaluate(`document.querySelector('[data-review-counts]').textContent`), '1 warn · 1 info · 2 for you')
    await click('[data-open-review]')
    await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
    assert.deepEqual(await page.evaluate('window.__reviewCalls'), [{ openReview: 'done', rev: 'a'.repeat(64) }], 'opening the review approves nothing')
  }
})

test('a revision written while the dialog is open updates it in place and resets Approve', { skip }, async () => {
  for (const [width, dark] of [[1280, false], [390, true]]) {
    await open('single', 'done', width, dark)
    await page.evaluate(`window.__moveRevision('done')`)
    await page.until(`Boolean(document.querySelector('[data-revision-moved]'))`, 10000)
    const text = await page.evaluate(`document.querySelector('[data-revision-moved]').textContent`)
    assert.match(text, /Changed while open: a{12,} → c{12,}/)
    assert.match(text, /requirements\.md \+1 −1/)
    assert.match(text, /tasks\.md \+1 −0/)
    assert.match(text, /Now fixed: A needed error case has no acceptance/)
    assert.match(text, /Moved or removed: The referenced helper does not exist/)
    assert.match(await page.evaluate(`document.querySelector('[data-review-counts]').textContent`), /1 for you · 1 fixed/)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[role="alert"]'))`), false)
    assert.equal(await page.evaluate(`document.querySelector('[data-approve-spec-go]').disabled`), false)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    assert.equal((await page.evaluate('window.__reviewCalls')).some((call) => call.operation === 'plan.approve'), false, 'nothing approved without a click')
    await click('[data-approve-spec-go]')
    await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
    assert.deepEqual((await page.evaluate('window.__reviewCalls')).find((call) => call.operation === 'plan.approve'), { operation: 'plan.approve', id: 'done', expectedHash: 'c'.repeat(64) })
    assert.deepEqual(page.errors, [])
  }
})

test('an approve sent for the old hash shows the update instead of a changed error', { skip }, async () => {
  await open('single')
  await page.evaluate(`window.__moveRevision('done')`)
  await click('[data-approve-spec-go]')
  await page.until(`Boolean(document.querySelector('[data-revision-moved]'))`, 10000)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[role="alert"]'))`), false)
  assert.doesNotMatch(await page.evaluate('document.body.textContent'), /Reload it before approving/)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-dialog-closed]'))`), false, 'the stale click approved nothing')
  assert.equal((await page.evaluate('window.__reviewCalls')).some((call) => call.operation === 'plan.approve'), false)
  await click('[data-approve-spec-go]')
  await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
  assert.deepEqual((await page.evaluate('window.__reviewCalls')).find((call) => call.operation === 'plan.approve'), { operation: 'plan.approve', id: 'done', expectedHash: 'c'.repeat(64) })
})

test('the batch dialog updates only the spec that moved and sends each shown revision', { skip }, async () => {
  await open('batch')
  await page.evaluate(`window.__moveRevision('done')`)
  await click('[data-approve-specs-go]')
  await page.until(`Boolean(document.querySelector('[data-approve-review="done"] [data-revision-moved]'))`, 10000)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-revision-moved]').length`), 1, 'the other specs are unchanged')
  assert.match(await page.evaluate(`document.querySelector('[data-approve-review="done"] [data-revision-moved]').textContent`), /aaaaaaaaaaaa → cccccccccccc/)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[role="alert"]'))`), false)
  assert.equal(await page.evaluate(`document.querySelector('[data-approve-row="done"]').textContent.includes('cccccccc')`), true, 'the table shows the new revision')
  assert.equal((await page.evaluate('window.__reviewCalls')).some((call) => call.operation === 'plan.approveMany'), false)
  await click('[data-approve-specs-go]')
  await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
  const sent = (await page.evaluate('window.__reviewCalls')).find((call) => call.operation === 'plan.approveMany').items
  assert.deepEqual(Object.fromEntries(sent.map((item) => [item.id, item.expectedHash[0]])), { done: 'c', older: 'a', running: 'a', skipped: 'a', 'not-reviewed': 'a' })
  assert.deepEqual(page.errors, [])
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


test('unknown-writer Review anyway queues a person choice without blocking approval', { skip }, async () => {
  await open('single', 'skipped', 390)
  await click('[data-review-anyway]')
  await page.until(`document.querySelector('[data-review-anyway]').disabled`)
  const calls = await page.evaluate('window.__reviewCalls')
  assert.deepEqual(calls[0], {operation:'plan.review.decide',workspaceId:'w',planId:'skipped',revisionHash:'a'.repeat(64),action:'review',unproven:true})
  assert.equal(await page.evaluate(`document.querySelector('[data-approve-spec-go]').disabled`), false)
  assert.match(await page.evaluate('document.body.textContent'), /Review queued for this revision/)
})
test('Planning groups show spec, role, model, time and usage on a phone', { skip }, async () => {
  await page.open(harness.url({mode:'planning'}),{width:390,height:900})
  await page.until(`Boolean(document.querySelector('[data-planning-flow]'))`)
  const text = await page.evaluate('document.body.textContent')
  for (const value of ['Planning','synthetic-spec','Reviewer','Planner answer','fake-reviewer','fake-writer','10 input / 5 output tokens','2 credits']) assert.ok(text.includes(value),value)
  assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),true)
  assert.deepEqual(page.errors,[])
})


test('batch Review anyway stays pinned to its opening workspace with identical IDs and hashes', {skip}, async () => {
  await page.open(harness.url({mode:'workspace-batch'}),{width:1280,height:900})
  await page.until(`Boolean(document.querySelector('[data-plans-list] input[type="checkbox"]'))`)
  await click('[data-plans-list] input[type="checkbox"]')
  await page.until(`!document.querySelector('[data-approve-specs-open]').disabled`)
  await click('[data-approve-specs-open]')
  await page.until(`Boolean(document.querySelector('[data-review-anyway]'))`)
  await page.evaluate(`window.__setReviewWorkspace('second')`)
  await page.until(`!document.querySelector('[data-approve-specs]')`)
  assert.deepEqual(await page.evaluate('window.__reviewCalls'),[])
  await page.evaluate(`window.__setReviewWorkspace('first')`)
  await page.until(`Boolean(document.querySelector('[data-plans-list]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-approve-specs]'))`),false)
  assert.deepEqual(await page.evaluate('window.__reviewCalls'),[])
})

test('a running review shows the purple working box, announced politely and still under reduced motion', { skip }, async () => {
  for (const [width, dark] of [[1280, false], [390, true]]) {
    await open('single', 'running', width, dark)
    const box = await page.evaluate(`(() => {
      const el = document.querySelector('[data-review-working]')
      const before = getComputedStyle(el, '::before')
      return { role: el.getAttribute('role'), live: el.getAttribute('aria-live'), label: el.getAttribute('aria-label'), text: el.textContent, border: getComputedStyle(el).borderTopColor, radius: getComputedStyle(el).borderTopLeftRadius, sweep: before.animationName, shown: before.display }
    })()`)
    assert.deepEqual([box.role, box.live, box.label], ['status', 'polite', 'Reviewing with fake-reviewer…'])
    assert.match(box.text, /Review running/)
    assert.notEqual(box.border, 'rgba(0, 0, 0, 0)', 'the box has a tinted border')
    assert.notEqual(box.radius, '0px', 'the box is rounded')
    assert.equal(box.sweep, 'none', 'reduced motion stops the sweep')
    assert.equal(box.shown, 'none')
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    assert.equal(await page.evaluate(`document.querySelector('[data-approve-spec-go]').disabled`), false)
    assert.deepEqual(page.errors, [])
  }
  const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/PlanReviewSummary.tsx', import.meta.url), 'utf8'))
  assert.match(source, /animation: avoozl-review-sweep 2s ease-in-out infinite/, 'motion matches Kiro Crew when motion is allowed')
})

test('an open dialog re-reads the stored review and swaps the working box for findings when it settles', { skip }, async () => {
  for (const mode of ['single', 'batch']) {
    await open(mode, 'running')
    await page.until(`Boolean(document.querySelector('[data-review-working]'))`)
    await page.evaluate('window.__settleRunning()')
    await page.until(`!document.querySelector('[data-review-working]')`, 10000)
    const text = await page.evaluate(`document.querySelector('[data-approve-spec], [data-approve-specs]').textContent`)
    assert.match(text, /1 warn · 1 info · 2 for you/)
    assert.ok((await page.evaluate('window.__summaryReads')).includes('running'), 'reads Avoozl\'s stored summary')
    assert.deepEqual(page.errors, [])
  }
})

test('when the plan moves during the review, the dialog says so and Approve targets the new revision', { skip }, async () => {
  await open('single', 'running')
  await page.evaluate('window.__settleRunning(true)')
  await page.until(`Boolean(document.querySelector('[data-revision-moved]'))`, 10000)
  assert.match(await page.evaluate(`document.querySelector('[data-revision-moved]').textContent`), /aaaaaaaaaaaa → cccccccccccc/)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-review-working]'))`), false)
  await click('[data-approve-spec-go]')
  await page.until(`Boolean(document.querySelector('[data-dialog-closed]'))`)
  const calls = await page.evaluate('window.__reviewCalls')
  assert.deepEqual(calls.find((call) => call.operation === 'plan.approve'), { operation: 'plan.approve', id: 'running', expectedHash: 'c'.repeat(64) })
})

test('the revision opens its diff since the approved revision', { skip }, async () => {
  for (const [width, dark] of [[1280, false], [390, true]]) {
    await open('single', 'done', width, dark)
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

test('the reviewer is a bordered table and the status and counts sit in their own box', { skip }, async () => {
  await open('single', 'skipped', 390)
  const layout = await page.evaluate(`(() => {
    const reviewer = document.querySelector('[data-review-reviewer]'), status = document.querySelector('[data-review-status]')
    const rows = [...reviewer.querySelectorAll('tr')].map((row) => [row.querySelector('th').textContent, row.querySelector('td').textContent])
    return { rows, notes: [...reviewer.querySelectorAll('[data-review-note]')].map((note) => note.textContent), separate: !reviewer.contains(status) && !status.contains(reviewer), counts: Boolean(status.querySelector('[data-review-counts]')), border: getComputedStyle(reviewer).borderTopStyle + getComputedStyle(status).borderTopStyle }
  })()`)
  assert.deepEqual(layout.rows.map(([name, value]) => [name, value.slice(0, 12)]), [['Reviewer', 'fake-reviewe'], ['Revision', 'aaaaaaaaaaaa'], ['Writer', 'unknown']])
  assert.deepEqual(layout.notes.length, 2)
  assert.match(layout.notes[0], /The writer model is unknown/)
  assert.match(layout.notes[1], /Reviewing anyway records/)
  assert.equal(layout.separate, true)
  assert.equal(layout.counts, true)
  assert.equal(layout.border, 'solidsolid')
  await click('[data-review-anyway]')
  await page.until(`document.querySelector('[data-review-status]').textContent.includes('Review queued for this revision')`)
})

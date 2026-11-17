// The spec page's Review view (R104.9-R104.11) in a real Chrome, on fake
// findings (browser/review-fixture.ts): file tabs, severity borders and
// labels, severity and state filters with counts, the person's actions at
// the revision on screen, and chat links or Chat closed. Skipped when no
// Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found'
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
const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
const text = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
const cards = () => page.evaluate(`[...document.querySelectorAll('[data-finding-card]')].map((c) => c.dataset.findingCard)`)
const border = (id) => page.evaluate(`getComputedStyle(document.querySelector('[data-finding-card="${id}"]')).borderLeftColor`)
const color = (value) => page.evaluate(`(() => { const s = document.createElement('span'); s.style.color = ${JSON.stringify(value)}; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c })()`)

async function openReview(width, dark) {
  await page.open(harness.url({ page: 'specs', review: '1', theme: dark ? 'dark' : 'light' }), { width, height: 900, dark })
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await page.until(`Boolean(document.querySelector('[data-open-review]'))`)
  await click('[data-open-review]')
  await page.until(`Boolean(document.querySelector('[data-finding-card]'))`)
}

for (const [width, dark] of [
  [1280, false],
  [390, true],
])
  test(`the review view shows tabs, severity borders, filters and chat links at ${width}`, { skip }, async () => {
    await openReview(width, dark)
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-tab]')].map((t) => t.dataset.reviewTab)`), ['requirements.md', 'design.md', 'tasks.md'])
    assert.match(await text('[data-review-doc]'), /fixed-width byte types/)
    // Requirements' findings in line order, each with its border and label.
    assert.deepEqual(await cards(), ['f-warn', 'f-blocker', 'f-later'])
    assert.equal(await border('f-blocker'), await color('var(--danger)'))
    assert.equal(await border('f-warn'), await color('var(--warning, #b7791f)'))
    assert.match(await text('[data-finding-card="f-blocker"] [data-severity-label]'), /^Blocker$/)
    assert.match(await text('[data-finding-card="f-warn"] [data-planner-response]'), /Fixed in c0ffee12c0ff/)
    // Chats: the reviewer's opens, the planner's is gone.
    assert.equal(await page.evaluate(`document.querySelector('[data-review-chat="open"]').getAttribute('href')`), '/chat?sid=reviewer-1')
    assert.match(await text('[data-planner-chat="closed"]'), /Chat closed/)
    assert.equal(await page.evaluate(`document.querySelector('[data-planner-chat] a, a[data-planner-chat]')`), null)
    // Filters show counts and narrow the rail.
    assert.match(await text('[data-severity-filter="warn"]'), /Warn\s*2/)
    await click('[data-severity-filter="blocker"]')
    await page.until(`document.querySelectorAll('[data-finding-card]').length === 1`)
    assert.deepEqual(await cards(), ['f-blocker'])
    assert.match(await text('[data-state-filter="for you"]'), /for you\s*1/)
    await click('[data-severity-filter="all"]')
    // Design: a rejected finding offers Reopen and shows its history; a
    // moved one says so.
    await click('[data-review-tab="design.md"]')
    await page.until(`Boolean(document.querySelector('[data-finding-card="f-info"]'))`)
    assert.equal(await border('f-info'), await color('var(--border)'))
    assert.match(await text('[data-finding-card="f-info"] [data-finding-history]'), /Rejected by Owner at c0ffee12c0ff · Created at install\./)
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-finding-card="f-info"] [data-finding-action]')].map((b) => b.dataset.findingAction)`), ['reopen'])
    assert.match(await text('[data-finding-card="f-moved"] [data-moved]'), /Moved or removed/)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'no page overflow')
    assert.deepEqual(page.errors, [])
  })

// Where each card and block sits, relative to the page.
const tops = () =>
  page.evaluate(`(() => {
    const top = (el) => Math.round(el.getBoundingClientRect().top + scrollY)
    const out = {}
    for (const c of document.querySelectorAll('[data-review-area] [data-finding-card]')) out[c.dataset.findingCard] = { top: top(c), bottom: top(c) + Math.round(c.getBoundingClientRect().height) }
    for (const b of document.querySelectorAll('[data-review-doc] [data-source-line]')) out['line ' + b.dataset.sourceLine] = { top: top(b) }
    return out
  })()`)

test('at 1280 each card sits level with its line, overlapping cards stack in line order, and moved ones list first', { skip }, async () => {
  await openReview(1280, false)
  assert.equal(await page.evaluate(`document.querySelector('[data-review-layout]').dataset.reviewLayout`), 'rail')
  const at = await tops()
  // Each card is level with its block unless the card above would overlap
  // it; then it sits just below that card. Line order holds.
  const near = (a, b) => Math.abs(a - b) <= 2
  assert.ok(near(at['f-warn'].top, at['line 5'].top), JSON.stringify(at))
  assert.ok(near(at['f-blocker'].top, Math.max(at['line 7'].top, at['f-warn'].bottom + 8)), JSON.stringify(at))
  assert.ok(near(at['f-later'].top, Math.max(at['line 14'].top, at['f-blocker'].bottom + 8)), JSON.stringify(at))
  await click('[data-review-tab="design.md"]')
  await page.until(`Boolean(document.querySelector('[data-moved-group] [data-finding-card="f-moved"]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-moved-group]').compareDocumentPosition(document.querySelector('[data-review-area]')) & Node.DOCUMENT_POSITION_FOLLOWING)`), true, 'Moved or removed is at the top of the rail')
  assert.deepEqual(page.errors, [])
})

test('a card click highlights its lines, and a click on highlighted text selects its card', { skip }, async () => {
  await openReview(1280, false)
  await click('[data-finding-card="f-later"]')
  await page.until(`document.querySelector('[data-finding-card="f-later"]').dataset.selected === 'true'`)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-hit]')].map((el) => el.dataset.sourceLine)`), ['14', '15'])
  // Text inside f-blocker's lines (7-8) selects f-blocker and moves the highlight.
  await click('[data-review-doc] [data-source-line="7"]')
  await page.until(`document.querySelector('[data-finding-card="f-blocker"]').dataset.selected === 'true'`)
  assert.equal(await page.evaluate(`document.querySelector('[data-finding-card="f-later"]').dataset.selected`), undefined)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-hit]')].map((el) => el.dataset.sourceLine)`), ['7', '8'])
  // A finding's buttons still work on a selected card.
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-finding-card="f-blocker"] [data-finding-action="accept"]'))`), true)
})

test('at 390 each card sits inline after its block', { skip }, async () => {
  await openReview(390, true)
  assert.equal(await page.evaluate(`document.querySelector('[data-review-layout]').dataset.reviewLayout`), 'inline')
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-review-rail]'))`), false)
  const after = (card, line) =>
    page.evaluate(`Boolean(document.querySelector('[data-source-line="${line}"]').compareDocumentPosition(document.querySelector('[data-finding-card="${card}"]')) & Node.DOCUMENT_POSITION_FOLLOWING)`)
  assert.equal(await after('f-later', 14), true)
  assert.equal(await after('f-blocker', 7), true)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-finding-card="f-later"]').compareDocumentPosition(document.querySelector('[data-source-line="17"]')) & Node.DOCUMENT_POSITION_FOLLOWING)`), true, 'before the next section')
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'no page overflow')
})

test('Reject needs a reason, and each action records the revision on screen', { skip }, async () => {
  await openReview(1280, false)
  await click('[data-finding-card="f-blocker"] [data-finding-action="reject"]')
  await page.until(`Boolean(document.querySelector('[data-finding-confirm="reject"]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-finding-confirm="reject"]').disabled`), true)
  await page.evaluate(`(() => { const t = document.querySelector('[data-finding-note]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Covered by the fuzz job.'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await page.until(`!document.querySelector('[data-finding-confirm="reject"]').disabled`)
  await click('[data-finding-confirm="reject"]')
  await page.until(`document.querySelector('[data-finding-card="f-blocker"]')?.dataset.findingState === 'rejected'`)
  await click('[data-review-tab="design.md"]')
  await page.until(`Boolean(document.querySelector('[data-finding-card="f-moved"]'))`)
  await click('[data-finding-card="f-moved"] [data-finding-action="accept"]')
  await page.until(`document.querySelector('[data-finding-card="f-moved"]')?.dataset.findingState === 'accepted'`)
  const calls = (await page.evaluate('window.__harness.calls')).filter((c) => c.operation === 'plan.review.finding.decide').map((c) => c.input)
  const hash = 'c0ffee12'.repeat(8)
  assert.deepEqual(calls, [
    { id: 'f-blocker', action: 'reject', revisionHash: hash, note: 'Covered by the fuzz job.' },
    { id: 'f-moved', action: 'accept', revisionHash: hash },
  ])
  // Back to spec leaves the view.
  await click('[data-review-close]')
  await page.until(`Boolean(document.querySelector('[data-spec-body]')) && !document.querySelector('[data-review-view]')`)
})

// The pure parts, under node's type stripping.
const { chipCounts, filterFindings, parseReviewLink, reviewLink } = await import('../src/review-view.ts')

test('the address keeps the review place, and a bad value is dropped', () => {
  const place = { plan: 'byte-types', rev: 'abc123', file: 'design.md', severity: 'warn', state: 'for you' }
  assert.equal(reviewLink(place), '?view=review&plan=byte-types&rev=abc123&file=design.md&severity=warn&state=for+you')
  assert.deepEqual(parseReviewLink(reviewLink(place)), place)
  assert.deepEqual(parseReviewLink('?view=review&plan=p&severity=loud&state=x&file=../x'), { plan: 'p', rev: null, file: null, severity: null, state: null })
  assert.equal(parseReviewLink('?view=graph&plan=p'), null)
  assert.equal(parseReviewLink('?view=review'), null)
})

test('each chip counts what would show with the other filter applied', () => {
  const f = (id, severity, state, line) => ({ id, severity, state, anchor: { file: 'a.md', lineStart: line, lineEnd: line } })
  const all = [f('b', 'warn', 'fixed', 9), f('a', 'blocker', 'for you', 2), f('c', 'warn', 'for you', 5)]
  assert.deepEqual(
    filterFindings(all, { severity: null, state: 'for you' }).map((x) => x.id),
    ['a', 'c'],
  )
  assert.deepEqual(chipCounts(all, { severity: 'warn', state: null }), { severity: { warn: 2, blocker: 1 }, state: { fixed: 1, 'for you': 1 } })
})

const { blockFor, blocksIn, stackCards } = await import('../src/review-view.ts')

test('an anchor maps to the blocks its lines touch, and cards stack in line order', () => {
  const lines = [1, 3, 5, 7, 8]
  assert.equal(blockFor(lines, 6), 2)
  assert.equal(blockFor(lines, 0), 0, 'before the first block: the first block')
  assert.deepEqual(blocksIn(lines, 5, 7), [2, 3])
  assert.deepEqual(blocksIn(lines, 9, 9), [4], 'the last block runs to the end')
  assert.deepEqual(
    stackCards([
      { id: 'b', want: 100, line: 7, height: 50 },
      { id: 'a', want: 90, line: 5, height: 40 },
      { id: 'c', want: 300, line: 16, height: 40 },
      { id: 'd', want: 100, line: 6, height: 10 },
    ]),
    { a: 90, d: 138, b: 156, c: 300 },
  )
})

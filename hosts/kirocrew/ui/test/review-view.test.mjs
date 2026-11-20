// The spec's review comments (R104.9-R104.11) in a real Chrome, on fake
// findings (browser/review-fixture.ts): each document tab shows its comments
// inline, a thread under the text it is on, with severity borders and
// labels, a show/hide toggle with a count, severity and state filters with
// counts, and the person's actions at the revision on screen; the
// Overview's Review card has the rounds with their chat links or Chat
// closed, and every comment, each a link to its line. There is no separate
// Review tab. Skipped when no Chrome is found.
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
const color = (value) =>
  page.evaluate(
    `(() => { const s = document.createElement('span'); s.style.color = ${JSON.stringify(value)}; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c })()`,
  )
// The block a thread sits under: its previous element, or for a list
// item's thread, the item before it.
const under = (id) =>
  page.evaluate(
    `(() => { const t = document.querySelector('[data-finding-card="${id}"]').closest('[data-inline-thread]'); const host = t.parentElement.hasAttribute('data-md-after') ? t.parentElement : t; return host.previousElementSibling?.dataset.sourceLine ?? null })()`,
  )

async function openSpec(width, dark) {
  await page.open(harness.url({ page: 'specs', review: '1', theme: dark ? 'dark' : 'light' }), { width, height: 900, dark })
  await page.evaluate(`localStorage.removeItem('avoozl:review-comments-hidden')`)
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await page.until(`Boolean(document.querySelector('[data-open-review]'))`)
}
async function openReview(width, dark) {
  await openSpec(width, dark)
  await click('[data-open-review]')
  await page.until(`Boolean(document.querySelector('[data-finding-card]'))`)
}

for (const [width, dark] of [
  [1280, false],
  [390, true],
])
  test(`each document tab shows its comments inline, with severity borders, filters and no Review tab at ${width}`, { skip }, async () => {
    await openReview(width, dark)
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-spec-tab]')].map((t) => t.dataset.specTab)`), [
      'overview',
      'tasks',
      'requirements.md',
      'design.md',
      'tasks.md',
    ])
    // Open review goes to the first document with an open comment.
    assert.equal(await page.evaluate(`document.querySelector('[data-spec-tab="requirements.md"]').getAttribute('aria-selected')`), 'true')
    assert.match(await text('[data-review-doc]'), /fixed-width byte types/)
    // No side column and no second tab bar: the text and its comments are one column.
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-review-rail], [data-review-side-tabs], [data-review-tabs], [data-review-contents]').length`), 0)
    // Requirements' comments in line order, each with its border and label.
    assert.deepEqual(await cards(), ['f-warn', 'f-blocker', 'f-later'])
    assert.equal(await border('f-blocker'), await color('var(--danger)'))
    assert.equal(await border('f-warn'), await color('var(--warn)'))
    assert.match(await text('[data-finding-card="f-blocker"] [data-severity-label]'), /^Blocker$/)
    assert.match(await text('[data-finding-card="f-warn"] [data-planner-response]'), /Fixed in c0ffee12c0ff/)
    // Filters show counts for this file and narrow its comments.
    assert.match(await text('[data-severity-filter="info"]'), /Info\s*1/)
    await click('[data-severity-filter="blocker"]')
    await page.until(`document.querySelectorAll('[data-finding-card]').length === 1`)
    assert.deepEqual(await cards(), ['f-blocker'])
    assert.match(await text('[data-state-filter="for you"]'), /for you\s*1/)
    await click('[data-severity-filter="blocker"]')
    await page.until(`document.querySelectorAll('[data-finding-card]').length === 3`)
    // Design: a rejected comment offers Reopen and shows its history; a
    // moved one lists first, under Moved or removed.
    await click('[data-spec-tab="design.md"]')
    await page.until(`Boolean(document.querySelector('[data-finding-card="f-info"]'))`)
    assert.equal(await border('f-info'), await color('var(--border)'))
    assert.match(await text('[data-finding-card="f-info"] [data-finding-history]'), /Rejected by Owner at c0ffee12c0ff · Created at install\./)
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-finding-card="f-info"] [data-finding-action]')].map((b) => b.dataset.findingAction)`), ['reopen'])
    assert.match(await text('[data-finding-card="f-moved"] [data-moved]'), /Moved or removed/)
    assert.equal(
      await page.evaluate(
        `Boolean(document.querySelector('[data-moved-group]').compareDocumentPosition(document.querySelector('[data-review-doc] [data-source-line]')) & Node.DOCUMENT_POSITION_FOLLOWING)`,
      ),
      true,
      'Moved or removed is above the text',
    )
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'no page overflow')
    assert.deepEqual(page.errors, [])
  })

test('a comment thread sits under the last block its lines touch, like a review comment in a diff', { skip }, async () => {
  await openReview(1280, false)
  // f-warn is on lines 5-6 (a paragraph), f-blocker on 7-8 (two list items),
  // f-later on 14-15 (two list items).
  assert.equal(await under('f-warn'), '5')
  assert.equal(await under('f-blocker'), '8')
  assert.equal(await under('f-later'), '15')
  // A thread inside a numbered list keeps the list's numbers.
  assert.deepEqual(
    await page.evaluate(`[...document.querySelectorAll('[data-review-doc] ol')].map((ol) => [...ol.querySelectorAll('li[data-source-line]')].map((li) => li.value))`),
    [
      [1, 2],
      [1, 2],
    ],
  )
  // The thread is text-wide, under its block, not beside it.
  assert.equal(
    await page.evaluate(
      `(() => { const t = document.querySelector('[data-inline-thread="5"]').getBoundingClientRect(), b = document.querySelector('[data-review-doc] [data-source-line="5"]').getBoundingClientRect(); return t.top >= b.bottom - 1 && Math.abs(t.left - b.left) < 2 })()`,
    ),
    true,
  )
  assert.deepEqual(page.errors, [])
})

test('the toggle hides and shows every inline comment, with its count, and is kept', { skip }, async () => {
  await openReview(1280, false)
  assert.equal(await page.evaluate(`document.querySelector('[data-comments-toggle]').getAttribute('aria-pressed')`), 'true')
  assert.match(await text('[data-comments-toggle]'), /Hide comments\s*3/)
  await click('[data-comments-toggle]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 0`)
  assert.match(await text('[data-comments-toggle]'), /Show comments\s*3/)
  assert.equal(
    await page.evaluate(`document.querySelectorAll('[data-inline-thread], [data-review-anchor], [data-review-filters]').length`),
    0,
    'no thread, tint or filters while hidden',
  )
  // Another document keeps them hidden.
  await click('[data-spec-tab="design.md"]')
  await page.until(`Boolean(document.querySelector('[data-review-doc="design.md"] [data-comments-toggle="hidden"]'))`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-finding-card]').length`), 0)
  await click('[data-comments-toggle]')
  await page.until(`Boolean(document.querySelector('[data-finding-card="f-info"]'))`)
  assert.match(await text('[data-comments-toggle]'), /Hide comments\s*2/)
  assert.deepEqual(page.errors, [])
})

for (const [width, dark] of [
  [1280, false],
  [390, true],
])
  test(`a highlight is tinted by severity, focusable, and picks its comment at ${width}`, { skip }, async () => {
    await openReview(width, dark)
    // f-blocker (lines 7-8) is tinted danger, f-warn (line 5) warn.
    const sev = (line) => page.evaluate(`document.querySelector('[data-review-doc] [data-source-line="${line}"]').dataset.reviewSev`)
    assert.equal(await sev(7), 'blocker')
    assert.equal(await sev(5), 'warn')
    assert.equal(
      await page.evaluate(
        `getComputedStyle(document.querySelector('[data-review-doc] [data-source-line="7"]')).backgroundColor !== getComputedStyle(document.querySelector('[data-review-doc] [data-source-line="3"]')).backgroundColor`,
      ),
      true,
    )
    assert.equal(await page.evaluate(`document.querySelector('[data-review-doc] [data-source-line="7"]').tabIndex`), 0)
    await click('[data-review-doc] [data-source-line="7"]')
    await page.until(`document.querySelector('[data-finding-card="f-blocker"]')?.dataset.selected === 'true'`)
    await page.evaluate('new Promise((r) => setTimeout(r, 700))')
    assert.equal(
      await page.evaluate(`(() => { const r = document.querySelector('[data-finding-card="f-blocker"]').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight })()`),
      true,
      'the comment is in view',
    )
    // Enter on a focused highlight does the same for another comment.
    await page.evaluate(`document.querySelector('[data-review-doc] [data-source-line="5"]').focus()`)
    await page.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`)
    await page.until(`document.querySelector('[data-finding-card="f-warn"]')?.dataset.selected === 'true'`)
    // A comment click marks its lines.
    await click('[data-finding-card="f-later"]')
    await page.until(`document.querySelector('[data-finding-card="f-later"]').dataset.selected === 'true'`)
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-hit]')].map((el) => el.dataset.sourceLine)`), ['14', '15'])
    assert.equal(await page.evaluate(`document.querySelector('[data-finding-card="f-warn"]').dataset.selected`), undefined)
    // A finding's buttons still work on a picked comment.
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-finding-card="f-later"] [data-finding-action="accept"]'))`), true)
    assert.deepEqual(page.errors, [])
  })

test('Reject needs a reason, and each action records the revision on screen', { skip }, async () => {
  await openReview(1280, false)
  await click('[data-finding-card="f-blocker"] [data-finding-action="reject"]')
  await page.until(`Boolean(document.querySelector('[data-finding-confirm="reject"]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-finding-confirm="reject"]').disabled`), true)
  await page.evaluate(
    `(() => { const t = document.querySelector('[data-finding-note]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Covered by the fuzz job.'); t.dispatchEvent(new Event('input', { bubbles: true })) })()`,
  )
  await page.until(`!document.querySelector('[data-finding-confirm="reject"]').disabled`)
  await click('[data-finding-confirm="reject"]')
  await page.until(`document.querySelector('[data-finding-card="f-blocker"]')?.dataset.findingState === 'rejected'`)
  await click('[data-spec-tab="design.md"]')
  await page.until(`Boolean(document.querySelector('[data-finding-card="f-moved"]'))`)
  await click('[data-finding-card="f-moved"] [data-finding-action="accept"]')
  await page.until(`document.querySelector('[data-finding-card="f-moved"]')?.dataset.findingState === 'accepted'`)
  const calls = (await page.evaluate('window.__harness.calls')).filter((c) => c.operation === 'plan.review.finding.decide').map((c) => c.input)
  const hash = 'c0ffee12'.repeat(8)
  assert.deepEqual(calls, [
    { id: 'f-blocker', action: 'reject', revisionHash: hash, note: 'Covered by the fuzz job.' },
    { id: 'f-moved', action: 'accept', revisionHash: hash },
  ])
  // The Overview shows no comment cards.
  await click('[data-spec-tab="overview"]')
  await page.until(`Boolean(document.querySelector('[data-spec-summary]')) && !document.querySelector('[data-finding-card]')`)
})

test('the spec Summary shows the written summary and open findings by severity', { skip }, async () => {
  await page.open(harness.url({ page: 'specs', review: '1' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await page.until(`Boolean(document.querySelector('[data-spec-summary]'))`)
  assert.match(await text('[data-spec-summary-text]'), /^Adds fixed-width byte types/)
  // Open: f-blocker and f-later (for you), f-moved (for you). f-warn is
  // fixed and f-info rejected, so they are not counted.
  const badges = () => page.evaluate(`[...document.querySelectorAll('[data-spec-summary] [data-severity-badge]')].map((b) => b.dataset.severityBadge + ' ' + b.textContent)`)
  assert.deepEqual(await badges(), ['blocker 1 blocker', 'warn 1 warn', 'info 1 info'])
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('[data-severity-badge="blocker"]')).color`), await color('var(--danger)'))
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('[data-severity-badge="warn"]')).color`), await color('var(--warn)'))
  // Without a written summary the quiet line shows; a zero count shows no badge.
  await page.open(harness.url({ page: 'specs', review: '1', summary: 'none' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`)
  await click('[data-plan-row="spec:byte-types"]')
  await page.until(`Boolean(document.querySelector('[data-spec-summary-fallback]'))`)
  assert.match(await text('[data-spec-summary-fallback]'), /^Summary unavailable/)
  await click('[data-open-review]')
  await page.until(`Boolean(document.querySelector('[data-finding-card="f-blocker"]'))`)
  await click('[data-finding-card="f-blocker"] [data-finding-action="resolve"]')
  await page.until(`document.querySelector('[data-finding-card="f-blocker"]')?.dataset.findingState === 'resolved'`)
  await click('[data-spec-tab="overview"]')
  await page.until(`Boolean(document.querySelector('[data-spec-summary] [data-severity-badges]'))`)
  assert.deepEqual(await badges(), ['warn 1 warn', 'info 1 info'])
  assert.deepEqual(page.errors, [])
})

test("the Overview's Review card has the rounds and chats, and lists every comment as a link to its line", { skip }, async () => {
  await openSpec(1280, false)
  await page.until(`Boolean(document.querySelector('[data-review-overview] [data-review-finding]'))`)
  // Chats: the reviewer's opens, the planner's is gone.
  assert.equal(await page.evaluate(`document.querySelector('[data-review-chat="open"]').getAttribute('href')`), '/chat?sid=reviewer-1')
  assert.match(await text('[data-planner-chat="closed"]'), /Chat closed/)
  assert.equal(await page.evaluate(`document.querySelector('[data-planner-chat] a, a[data-planner-chat]')`), null)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-finding]')].map((f) => f.dataset.reviewFinding)`), [
    'f-info',
    'f-moved',
    'f-warn',
    'f-blocker',
    'f-later',
  ])
  assert.match(await text('[data-review-finding="f-moved"]'), /design\.md:9 · moved/)
  // A comment's link opens its document, picks it and marks its lines.
  await click('[data-finding-open="f-later"]')
  await page.until(`document.querySelector('[data-spec-tab="requirements.md"]').getAttribute('aria-selected') === 'true'`)
  await page.until(`document.querySelector('[data-finding-card="f-later"]')?.dataset.selected === 'true'`)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-hit]')].map((el) => el.dataset.sourceLine)`), ['14', '15'])
  // A design.md comment opens that tab.
  await click('[data-spec-tab="overview"]')
  await page.until(`Boolean(document.querySelector('[data-finding-open="f-info"]'))`)
  await click('[data-finding-open="f-info"]')
  await page.until(
    `document.querySelector('[data-finding-card="f-info"]')?.dataset.selected === 'true' && document.querySelector('[data-spec-tab="design.md"]').getAttribute('aria-selected') === 'true'`,
  )
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-hit]')].map((el) => el.dataset.sourceLine)`), ['3'])
  assert.deepEqual(page.errors, [])
})

test('the severity and state buttons are toggles on one line: several on at once, none on shows all', { skip }, async () => {
  await openReview(1280, false)
  const pressed = () =>
    page.evaluate(`[...document.querySelectorAll('[data-severity-filter]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.severityFilter)`)
  assert.deepEqual(await pressed(), [])
  assert.deepEqual(await cards(), ['f-warn', 'f-blocker', 'f-later'])
  // Blocker and Warn on: both kinds show, Info hides.
  await click('[data-severity-filter="blocker"]')
  await click('[data-severity-filter="warn"]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 2`)
  assert.deepEqual(await cards(), ['f-warn', 'f-blocker'])
  assert.deepEqual(await pressed(), ['blocker', 'warn'])
  // Blocker off again: only Warn shows.
  await click('[data-severity-filter="blocker"]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 1`)
  assert.deepEqual(await cards(), ['f-warn'])
  // The state buttons toggle too, and both groups share one line on a desktop.
  await click('[data-severity-filter="warn"]')
  await click('[data-state-filter="for you"]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 2`)
  assert.deepEqual(await cards(), ['f-blocker', 'f-later'])
  const tops = await page.evaluate(`[...document.querySelectorAll('[data-severity-filters], [data-state-filters]')].map((g) => Math.round(g.getBoundingClientRect().top))`)
  assert.equal(tops.length, 2)
  assert.ok(Math.abs(tops[0] - tops[1]) < 8, 'severity and state share a line')
  // The filters are kept on another document tab.
  await click('[data-spec-tab="design.md"]')
  await page.until(`Boolean(document.querySelector('[data-review-doc="design.md"]'))`)
  assert.deepEqual(await cards(), ['f-moved'])
  assert.deepEqual(page.errors, [])
})

test('a card has a severity icon, a one-line title, a clamped body and one main action', { skip }, async () => {
  await openReview(1280, false)
  const card = '[data-finding-card="f-blocker"]'
  const style = (sel, prop) => page.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(sel)}))[${JSON.stringify(prop)}]`)
  assert.equal(await style(card, 'borderTopLeftRadius'), '12px')
  assert.equal(await style(card, 'borderTopColor'), await color('var(--danger)'))
  assert.equal(await style(card + ' svg', 'color'), await color('var(--danger)'))
  assert.equal(await style(card + ' [data-finding-title]', 'whiteSpace'), 'nowrap')
  assert.equal(await style(card + ' [data-finding-title]', 'textOverflow'), 'ellipsis')
  assert.equal(await style(card + ' [data-finding-body]', 'webkitLineClamp'), '3')
  await click(card + ' [data-finding-body]')
  await page.until(`document.querySelector('${card} [data-finding-body]').getAttribute('aria-expanded') === 'true'`)
  assert.equal(await style(card + ' [data-finding-body]', 'webkitLineClamp'), 'none')
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${card} [data-finding-action]')].map((b) => b.dataset.findingAction + (b.dataset.main ? '*' : ''))`), [
    'accept*',
    'reject',
    'defer',
    'resolve',
  ])
  assert.deepEqual(
    await page.evaluate(`[...document.querySelectorAll('[data-finding-card="f-warn"] [data-finding-action]')].map((b) => b.dataset.findingAction + (b.dataset.main ? '*' : ''))`),
    ['resolve*', 'accept', 'reject', 'defer'],
    'a fixed finding leads with Resolve',
  )
  assert.match(await text(card + ' [data-finding-hint]'), /Accept sends it to the planner/)
  // The main action's text is the accent, not the body text color.
  assert.notEqual(await style(card + ' [data-main]', 'color'), await style(card + ' [data-finding-action="reject"]', 'color'))
})

// The pure parts, under node's type stripping.
const { chipCounts, filterFindings, parseReviewLink, reviewHref, reviewLink } = await import('../src/review-view.ts')

test('an Approve dialog links to the review comments at its revision on the app route only', () => {
  assert.equal(reviewHref('/apps/avoozl', 'p1', 'abc123'), '/apps/avoozl?view=review&plan=p1&rev=abc123')
  assert.equal(reviewHref('/popout/apps/avoozl', 'p1', 'abc123'), null)
})

test('the address keeps the review place, and a bad value is dropped', () => {
  const place = { plan: 'byte-types', rev: 'abc123', file: 'design.md', finding: 'f-1', severity: ['blocker', 'warn'], state: ['for you', 'open'] }
  assert.equal(reviewLink(place), '?view=review&plan=byte-types&rev=abc123&file=design.md&finding=f-1&severity=blocker%2Cwarn&state=for+you%2Copen')
  assert.deepEqual(parseReviewLink(reviewLink(place)), place)
  assert.deepEqual(parseReviewLink('?view=review&plan=p&severity=loud&state=x&file=../x&finding=a%20b'), {
    plan: 'p',
    rev: null,
    file: null,
    finding: null,
    severity: [],
    state: [],
  })
  assert.deepEqual(parseReviewLink('?view=review&plan=p&severity=warn,loud,blocker').severity, ['blocker', 'warn'])
  assert.equal(parseReviewLink('?view=graph&plan=p'), null)
  assert.equal(parseReviewLink('?view=review'), null)
})

test('each chip counts what would show with the other filter applied', () => {
  const f = (id, severity, state, line) => ({ id, severity, state, anchor: { file: 'a.md', lineStart: line, lineEnd: line } })
  const all = [f('b', 'warn', 'fixed', 9), f('a', 'blocker', 'for you', 2), f('c', 'warn', 'for you', 5)]
  assert.deepEqual(
    filterFindings(all, { severity: [], state: ['for you'] }).map((x) => x.id),
    ['a', 'c'],
  )
  assert.deepEqual(
    filterFindings(all, { severity: ['blocker', 'warn'], state: [] }).map((x) => x.id),
    ['a', 'c', 'b'],
  )
  assert.deepEqual(chipCounts(all, { severity: ['warn'], state: [] }), { severity: { warn: 2, blocker: 1 }, state: { fixed: 1, 'for you': 1 } })
})

const { openCounts, tabKey } = await import('../src/review-view.ts')

test('open counts leave out fixed and closed findings, and tab keys wrap', () => {
  const f = (severity, state, file) => ({ severity, state, anchor: { file, lineStart: 1, lineEnd: 1 } })
  assert.deepEqual(
    openCounts([f('blocker', 'for you', 'a.md'), f('warn', 'accepted', 'b.md'), f('warn', 'fixed', 'a.md'), f('info', 'rejected', 'a.md'), f('info', 'answered', 'a.md')]),
    {
      byFile: { 'a.md': 2, 'b.md': 1 },
      bySeverity: { blocker: 1, warn: 1, info: 1 },
      total: 3,
    },
  )
  const tabs = ['a', 'b', 'all']
  assert.equal(tabKey('ArrowRight', tabs, 'all'), 'a')
  assert.equal(tabKey('ArrowLeft', tabs, 'a'), 'all')
  assert.equal(tabKey('End', tabs, 'a'), 'all')
  assert.equal(tabKey('Home', tabs, 'b'), 'a')
  assert.equal(tabKey('Enter', tabs, 'b'), null)
  assert.equal(parseReviewLink('?view=review&plan=p&file=avoozl/manifest.json').file, 'avoozl/manifest.json')
})

const { blockFor, blocksIn } = await import('../src/review-view.ts')

test('an anchor maps to the blocks its lines touch', () => {
  const lines = [1, 3, 5, 7, 8]
  assert.equal(blockFor(lines, 6), 2)
  assert.equal(blockFor(lines, 0), 0, 'before the first block: the first block')
  assert.deepEqual(blocksIn(lines, 5, 7), [2, 3])
  assert.deepEqual(blocksIn(lines, 9, 9), [4], 'the last block runs to the end')
})

const { threadLines, firstReviewFile } = await import('../src/review-view.ts')
const { blockLines } = await import('../src/markdown.ts')

test("a thread goes under the last block its anchor touches, keyed by that block's first line", () => {
  const text = ['# Title', '', 'A paragraph', 'that wraps.', '', '1. one', '2. two', '', 'Tail.'].join('\n')
  const lines = blockLines(text)
  assert.deepEqual(lines, [1, 3, 6, 7, 9], 'list items stand in for their list')
  const f = (id, lineStart, lineEnd) => ({ id, anchor: { file: 'a.md', lineStart, lineEnd } })
  const map = threadLines(lines, [f('p', 3, 4), f('list', 6, 7), f('end', 9, 20), f('also-p', 4, 4)])
  assert.deepEqual(
    [...map].map(([line, list]) => [line, list.map((x) => x.id)]),
    [
      [3, ['p', 'also-p']],
      [7, ['list']],
      [9, ['end']],
    ],
  )
  assert.equal(threadLines([], [f('x', 1, 1)]).size, 0)
})

test('a review place with no file opens the first document with an open comment', () => {
  const files = ['requirements.md', 'design.md', 'tasks.md']
  assert.equal(firstReviewFile(files, [{ file: 'design.md', state: 'for you' }]), 'design.md')
  assert.equal(firstReviewFile(files, [{ file: 'design.md', state: 'resolved' }]), 'requirements.md')
  assert.equal(firstReviewFile([], []), null)
})

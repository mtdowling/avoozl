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
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-tab]')].map((t) => t.dataset.reviewTab)`), ['requirements.md', 'design.md', 'tasks.md', 'all'])
    assert.match(await text('[data-review-doc]'), /fixed-width byte types/)
    // Requirements' findings in line order, each with its border and label.
    assert.deepEqual(await cards(), ['f-warn', 'f-blocker', 'f-later'])
    assert.equal(await border('f-blocker'), await color('var(--danger)'))
    assert.equal(await border('f-warn'), await color('var(--warn)'))
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
    await click('[data-severity-filter="blocker"]')
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

test('at 1280 the side column has Contents and Comments, and moved findings list first in Comments', { skip }, async () => {
  await openReview(1280, false)
  assert.equal(await page.evaluate(`document.querySelector('[data-review-layout]').dataset.reviewLayout`), 'rail')
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-side-tab]')].map((t) => t.dataset.reviewSideTab)`), ['contents', 'comments'])
  assert.equal(await page.evaluate(`document.querySelector('[data-review-side-tab="comments"]').getAttribute('aria-selected')`), 'true')
  assert.deepEqual(await cards(), ['f-warn', 'f-blocker', 'f-later'])
  // The text sits left of the column.
  assert.equal(await page.evaluate(`document.querySelector('[data-review-doc]').getBoundingClientRect().right <= document.querySelector('[data-review-rail]').getBoundingClientRect().left + 1`), true)
  await click('[data-review-tab="design.md"]')
  await page.until(`Boolean(document.querySelector('[data-moved-group] [data-finding-card="f-moved"]'))`)
  assert.equal(await page.evaluate(`document.querySelector('[data-review-comments]').firstElementChild.hasAttribute('data-moved-group')`), true, 'Moved or removed is at the top of Comments')
  assert.deepEqual(page.errors, [])
})

test('Contents lists the headings, a click scrolls there, and the section in view is marked', { skip }, async () => {
  await openReview(1280, false)
  await click('[data-review-side-tab="contents"]')
  await page.until(`Boolean(document.querySelector('[data-review-contents] [data-toc-item]'))`)
  const items = () => page.evaluate(`[...document.querySelectorAll('[data-toc-item]')].map((b) => b.textContent)`)
  assert.deepEqual((await items()).slice(0, 3), ['Requirements', 'Requirement 1: Byte types', 'Requirement 2: Byte strings'])
  assert.equal(await page.evaluate(`document.querySelector('[data-toc-item]').getAttribute('aria-current')`), 'location')
  const last = await page.evaluate(`document.querySelectorAll('[data-toc-item]').length - 1`)
  await page.evaluate(`document.querySelectorAll('[data-toc-item]')[${last}].click()`)
  await page.until(`document.querySelectorAll('[data-toc-item]')[${last}].getAttribute('aria-current') === 'location'`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-toc-item][aria-current]').length`), 1)
  // A file with no headings says so; the Comments tab brings the cards back.
  await click('[data-review-side-tab="comments"]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 3`)
  assert.deepEqual(page.errors, [])
})

for (const [width, dark] of [
  [1280, false],
  [390, true],
])
  test(`a highlight is tinted by severity, focusable, and opens its card in Comments at ${width}`, { skip }, async () => {
    await openReview(width, dark)
    // f-blocker (lines 7-8) is tinted danger, f-warn (line 5) warn.
    const sev = (line) => page.evaluate(`document.querySelector('[data-review-doc] [data-source-line="${line}"]').dataset.reviewSev`)
    assert.equal(await sev(7), 'blocker')
    assert.equal(await sev(5), 'warn')
    assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('[data-review-doc] [data-source-line="7"]')).backgroundColor !== getComputedStyle(document.querySelector('[data-review-doc] [data-source-line="3"]')).backgroundColor`), true)
    assert.equal(await page.evaluate(`document.querySelector('[data-review-doc] [data-source-line="7"]').tabIndex`), 0)
    // From Contents, a click on a highlight switches to Comments and marks the card in view.
    await click('[data-review-side-tab="contents"]')
    await page.until(`Boolean(document.querySelector('[data-review-contents]'))`)
    await click('[data-review-doc] [data-source-line="7"]')
    await page.until(`document.querySelector('[data-finding-card="f-blocker"]')?.dataset.selected === 'true'`)
    assert.equal(await page.evaluate(`document.querySelector('[data-review-side-tab="comments"]').getAttribute('aria-selected')`), 'true')
    await page.evaluate('new Promise((r) => setTimeout(r, 700))')
    assert.equal(await page.evaluate(`(() => { const r = document.querySelector('[data-finding-card="f-blocker"]').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight })()`), true, 'the card is in view')
    // Enter on a focused highlight does the same for another finding.
    await click('[data-review-side-tab="contents"]')
    await page.evaluate(`document.querySelector('[data-review-doc] [data-source-line="5"]').focus()`)
    await page.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`)
    await page.until(`document.querySelector('[data-finding-card="f-warn"]')?.dataset.selected === 'true'`)
    assert.equal(await page.evaluate(`document.querySelector('[data-review-side-tab="comments"]').getAttribute('aria-selected')`), 'true')
    // A card click still scrolls the text to its highlight.
    await click('[data-finding-card="f-later"]')
    await page.until(`document.querySelector('[data-finding-card="f-later"]').dataset.selected === 'true'`)
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-hit]')].map((el) => el.dataset.sourceLine)`), ['14', '15'])
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

test('at 390 the side column sits under the document with the same two tabs', { skip }, async () => {
  await openReview(390, true)
  assert.equal(await page.evaluate(`document.querySelector('[data-review-layout]').dataset.reviewLayout`), 'inline')
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-side-tab]')].map((t) => t.dataset.reviewSideTab)`), ['contents', 'comments'])
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-review-doc]').compareDocumentPosition(document.querySelector('[data-review-rail]')) & Node.DOCUMENT_POSITION_FOLLOWING)`), true)
  assert.equal(await page.evaluate(`document.querySelector('[data-review-rail]').getBoundingClientRect().top >= document.querySelector('[data-review-doc]').getBoundingClientRect().bottom - 1`), true, 'under, not beside')
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'no page overflow')
})

test('the side column keeps its Contents and Comments tab bar in view when the page fills the window', { skip }, async () => {
  await openReview(1280, false)
  // In a column that scrolls, a bar that scrolls sideways must not shrink.
  assert.ok(await page.evaluate(`document.querySelector('[data-review-side-tabs]').getBoundingClientRect().height > 20`), 'Contents and Comments show')
  await click('[data-review-side-tab="contents"]')
  await page.until(`Boolean(document.querySelector('[data-review-contents]'))`)
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
  // The Overview tab leaves the view.
  await click('[data-spec-tab="overview"]')
  await page.until(`Boolean(document.querySelector('[data-spec-body]')) && !document.querySelector('[data-review-view]')`)
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

test('the tab bar moves with arrow keys, Home and End, and counts open findings per file', { skip }, async () => {
  await openReview(1280, false)
  const tabs = () => page.evaluate(`[...document.querySelectorAll('[data-review-tab]')].map((t) => [t.dataset.reviewTab, t.getAttribute('aria-selected'), t.tabIndex, t.querySelector('[data-tab-count]').textContent])`)
  assert.deepEqual(await tabs(), [
    ['requirements.md', 'true', 0, '2'],
    ['design.md', 'false', -1, '1'],
    ['tasks.md', 'false', -1, '0'],
    ['all', 'false', -1, '3'],
  ])
  const key = (k) => page.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`)
  await page.evaluate(`document.querySelector('[data-review-tab="requirements.md"]').focus()`)
  await key('ArrowRight')
  await page.until(`document.querySelector('[data-review-tab="design.md"]').getAttribute('aria-selected') === 'true'`)
  assert.equal(await page.evaluate(`document.activeElement.dataset.reviewTab`), 'design.md')
  assert.match(await text('[data-review-doc]'), /bytes\.toml/)
  await key('End')
  await page.until(`Boolean(document.querySelector('[data-review-all]'))`)
  await key('ArrowRight')
  await page.until(`document.querySelector('[data-review-tab="requirements.md"]').getAttribute('aria-selected') === 'true'`)
  await key('ArrowLeft')
  await page.until(`Boolean(document.querySelector('[data-review-all]'))`)
  await key('Home')
  await page.until(`document.querySelector('[data-review-tab="requirements.md"]').getAttribute('aria-selected') === 'true'`)
  // tasks.md shows its Facts bullets as written.
  await click('[data-review-tab="tasks.md"]')
  await page.until(`/Facts:/.test(document.querySelector('[data-review-doc]')?.textContent ?? '')`)
  assert.equal(await page.evaluate(`document.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')`), await page.evaluate(`document.querySelector('[data-review-tab="tasks.md"]').id`))
  assert.deepEqual(page.errors, [])
})

test('the severity and state buttons are toggles on one line: several on at once, none on shows all', { skip }, async () => {
  await openReview(1280, false)
  await click('[data-review-tab="all"]')
  await page.until(`Boolean(document.querySelector('[data-review-all] [data-finding-card]'))`)
  const pressed = () => page.evaluate(`[...document.querySelectorAll('[data-severity-filter]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.severityFilter)`)
  assert.deepEqual(await pressed(), [])
  assert.deepEqual(await cards(), ['f-info', 'f-moved', 'f-warn', 'f-blocker', 'f-later'])
  // Blocker and Warn on: both kinds show, Info hides.
  await click('[data-severity-filter="blocker"]')
  await click('[data-severity-filter="warn"]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 3`)
  assert.deepEqual(await cards(), ['f-moved', 'f-warn', 'f-blocker'])
  assert.deepEqual(await pressed(), ['blocker', 'warn'])
  // Blocker off again: only Warn shows.
  await click('[data-severity-filter="blocker"]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 2`)
  assert.deepEqual(await cards(), ['f-moved', 'f-warn'])
  // The state buttons toggle too, and both groups share one line on a desktop.
  await click('[data-severity-filter="warn"]')
  await click('[data-state-filter="for you"]')
  await click('[data-state-filter="fixed"]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 4`)
  assert.deepEqual(await cards(), ['f-moved', 'f-warn', 'f-blocker', 'f-later'])
  const tops = await page.evaluate(`[...document.querySelectorAll('[data-severity-filters], [data-state-filters]')].map((g) => Math.round(g.getBoundingClientRect().top))`)
  assert.equal(tops.length, 2)
  assert.ok(Math.abs(tops[0] - tops[1]) < 8, 'severity and state share a line')
  assert.deepEqual(page.errors, [])
})

test('All findings lists every file, filters, and a click opens the finding at its lines', { skip }, async () => {
  await openReview(1280, false)
  await click('[data-review-tab="all"]')
  await page.until(`Boolean(document.querySelector('[data-review-all] [data-finding-card]'))`)
  assert.deepEqual(await cards(), ['f-info', 'f-moved', 'f-warn', 'f-blocker', 'f-later'])
  await click('[data-severity-filter="info"]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 2`)
  assert.deepEqual(await cards(), ['f-info', 'f-later'])
  await click('[data-severity-filter="info"]')
  await page.until(`document.querySelectorAll('[data-finding-card]').length === 5`)
  // A button on the card acts without leaving the tab.
  await click('[data-finding-card="f-later"] [data-finding-action="reject"]')
  await page.until(`Boolean(document.querySelector('[data-finding-confirm="reject"]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-review-all]'))`), true)
  await click('[data-finding-cancel]')
  // The card itself goes to its file, selects it and highlights its lines.
  await click('[data-review-all] [data-finding-card="f-later"] [data-finding-title]')
  await page.until(`document.querySelector('[data-review-tab="requirements.md"]').getAttribute('aria-selected') === 'true'`)
  await page.until(`document.querySelector('[data-finding-card="f-later"]')?.dataset.selected === 'true'`)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-hit]')].map((el) => el.dataset.sourceLine)`), ['14', '15'])
  // A design.md finding switches to that tab.
  await click('[data-review-tab="all"]')
  await page.until(`Boolean(document.querySelector('[data-review-all]'))`)
  await click('[data-review-all] [data-finding-card="f-info"] [data-finding-title]')
  await page.until(`document.querySelector('[data-finding-card="f-info"]')?.dataset.selected === 'true' && document.querySelector('[data-review-tab="design.md"]').getAttribute('aria-selected') === 'true'`)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-review-hit]')].map((el) => el.dataset.sourceLine)`), ['3'])
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
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${card} [data-finding-action]')].map((b) => b.dataset.findingAction + (b.dataset.main ? '*' : ''))`), ['accept*', 'reject', 'defer', 'resolve'])
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-finding-card="f-warn"] [data-finding-action]')].map((b) => b.dataset.findingAction + (b.dataset.main ? '*' : ''))`), ['resolve*', 'accept', 'reject', 'defer'], 'a fixed finding leads with Resolve')
  assert.match(await text(card + ' [data-finding-hint]'), /Accept sends it to the planner/)
  // The main action's text is the accent, not the body text color.
  assert.notEqual(await style(card + ' [data-main]', 'color'), await style(card + ' [data-finding-action="reject"]', 'color'))
})

// The pure parts, under node's type stripping.
const { chipCounts, filterFindings, parseReviewLink, reviewHref, reviewLink } = await import('../src/review-view.ts')

test('an Approve dialog links to the Review view at its revision on the app route only', () => {
  assert.equal(reviewHref('/apps/avoozl', 'p1', 'abc123'), '/apps/avoozl?view=review&plan=p1&rev=abc123')
  assert.equal(reviewHref('/popout/apps/avoozl', 'p1', 'abc123'), null)
})

test('the address keeps the review place, and a bad value is dropped', () => {
  const place = { plan: 'byte-types', rev: 'abc123', file: 'design.md', severity: ['blocker', 'warn'], state: ['for you', 'open'] }
  assert.equal(reviewLink(place), '?view=review&plan=byte-types&rev=abc123&file=design.md&severity=blocker%2Cwarn&state=for+you%2Copen')
  assert.deepEqual(parseReviewLink(reviewLink(place)), place)
  assert.deepEqual(parseReviewLink('?view=review&plan=p&severity=loud&state=x&file=../x'), { plan: 'p', rev: null, file: null, severity: [], state: [] })
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
  assert.deepEqual(filterFindings(all, { severity: ['blocker', 'warn'], state: [] }).map((x) => x.id), ['a', 'c', 'b'])
  assert.deepEqual(chipCounts(all, { severity: ['warn'], state: [] }), { severity: { warn: 2, blocker: 1 }, state: { fixed: 1, 'for you': 1 } })
})

const { openCounts, tabKey } = await import('../src/review-view.ts')

test('open counts leave out fixed and closed findings, and tab keys wrap', () => {
  const f = (severity, state, file) => ({ severity, state, anchor: { file, lineStart: 1, lineEnd: 1 } })
  assert.deepEqual(openCounts([f('blocker', 'for you', 'a.md'), f('warn', 'accepted', 'b.md'), f('warn', 'fixed', 'a.md'), f('info', 'rejected', 'a.md'), f('info', 'answered', 'a.md')]), {
    byFile: { 'a.md': 2, 'b.md': 1 },
    bySeverity: { blocker: 1, warn: 1, info: 1 },
    total: 3,
  })
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

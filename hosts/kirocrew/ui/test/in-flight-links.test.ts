// In flight's PR and branch chips (R92.6, R92.9, task 44.4): the check dot's
// words, and in a real Chrome (harness ?page=app&links=1) new-tab links and
// chips that fit a 390 px row. The browser part is skipped when no Chrome is
// found.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDot } from '../src/in-flight-api.ts'
import { findChrome, type Harness, type Page } from './browser/chrome.ts'
import { withChrome } from './browser/harness-page.ts'
import { inFlight } from './browser/in-flight-nav.ts'

type Checks = Parameters<typeof checkDot>[0]
const checks = (extra: Partial<Checks> = {}): Checks => ({ state: 'pass', dot: 'pass', head: 'a'.repeat(40), ageMs: 4 * 60000, current: true, url: null, ...extra })

test('the check dot: a theme color per state, grey and said for an older head', () => {
  assert.deepEqual(checkDot(checks()), { dot: 'pass', color: 'var(--ok)', label: 'Checks pass on aaaaaaa · read 4 min ago' })
  assert.equal(checkDot(checks({ state: 'fail', dot: 'fail' })).color, 'var(--danger)')
  assert.equal(checkDot(checks({ state: 'pending', dot: 'pending', ageMs: null })).label, 'Checks running on aaaaaaa · read time unknown')
  // A pass for an old head never shows as a pass.
  const stale = checkDot(checks({ dot: 'stale', current: false, head: 'b'.repeat(40) }))
  assert.equal(stale.dot, 'stale')
  assert.equal(stale.color, 'var(--muted)')
  assert.match(stale.label, /older commit bbbbbbb, not the current one/)
  assert.deepEqual(checkDot(null), { dot: 'none', color: 'var(--border)', label: 'No check result stored' })
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the In flight chips browser test'
let harness: Harness, page: Page
withChrome(chrome, (got) => ({ harness, page } = got))

for (const width of [1280, 390])
  test(`each In flight row has PR and branch chips that open a new tab and fit at ${width} px`, { skip }, async () => {
    await page.open(harness.url({ page: 'app', links: '1' }), { width, height: 900 })
    await inFlight(page)
    await page.until(`document.querySelectorAll('[data-in-flight-row]').length === 5`, 30000)
    const chips = await page.evaluate<
      { pr: string | null; dot: string | null; background: string | null; branch: string | null; links: string[]; fits: boolean; chipsHigh: number }[]
    >(`[...document.querySelectorAll('[data-in-flight-row]')].map((row) => {
      const box = row.getBoundingClientRect(), pr = row.querySelector('[data-pr-chip]'), branch = row.querySelector('[data-branch-chip]')
      const right = (el) => el ? el.getBoundingClientRect().right : 0
      return {
        pr: pr && pr.textContent, dot: pr && pr.querySelector('[data-check-dot]').dataset.checkDot,
        background: pr && pr.querySelector('[data-check-dot]').style.background,
        branch: branch && branch.textContent,
        links: [pr, branch].filter(Boolean).map((a) => a.target + ' ' + a.rel),
        fits: box.right <= window.innerWidth + 0.5 && right(pr) <= box.right + 0.5 && right(branch) <= box.right + 0.5,
        chipsHigh: row.querySelector('[data-in-flight-links]').getBoundingClientRect().height,
      }
    })`)
    assert.deepEqual(
      chips.map((c) => [c.pr, c.dot]),
      [
        ['PR #412', 'pass'],
        ['PR #415', 'pending'],
        ['PR #418', 'fail'],
        ['PR #420', 'stale'],
        [null, null],
      ],
    )
    for (const c of chips) {
      assert.ok(c.branch, 'every row has a branch chip')
      for (const link of c.links) assert.equal(link, '_blank noopener noreferrer')
      assert.ok(c.fits, `chips stay inside the row: ${c.branch}`)
      // One line: the long branch name shrinks with an ellipsis, not a wrap.
      assert.ok(c.chipsHigh < 24, `chips take one line, got ${c.chipsHigh}px`)
      if (c.background) assert.match(c.background, /^var\(--/)
    }
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true)
    // The chips never set a row's narrowest width: a long branch name must
    // not push a grid card wider than a phone (its min-content is the row's).
    const narrowest = await page.evaluate<number>(`(() => {
      const list = document.querySelector('[data-in-flight-row]').parentElement, before = list.style.width
      list.style.width = 'min-content'
      const widths = [...list.querySelectorAll('[data-in-flight-row]')].map((row) => row.getBoundingClientRect().width)
      list.style.width = before
      return Math.max(...widths)
    })()`)
    assert.ok(narrowest <= 358, `a row's narrowest width fits a 390 px card, got ${narrowest}px`)
    assert.deepEqual(page.errors, [])
  })

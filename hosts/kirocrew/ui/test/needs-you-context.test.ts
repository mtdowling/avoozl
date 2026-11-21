// Needs you shows enough to decide before any button: the spec link, the task,
// what is asked and unblocked, and evidence per kind. In a real Chrome (set
// AVOOZL_CHROME) each fixture kind is drawn in the full app and checked;
// the pure parts and the source order run everywhere.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { findChrome, type Harness, type Page } from './browser/chrome.ts'
import { withChrome } from './browser/harness-page.ts'
import { askLine, evidenceOf, lineDiff, reviewEvidence, sourceLine, unblockLine } from '../src/needs-you-context.ts'
import { needsContextItems } from './browser/needs-context-fixture.ts'
import type { ConflictItem } from '../src/views-api.ts'

const source = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('a diff marks removed and added task lines', () => {
  const lines = lineDiff(['a', 'b', 'c'], ['a', 'x', 'c'])
  assert.deepEqual(
    lines.map((l) => l.kind),
    ['same', 'remove', 'add', 'same'],
  )
})

test('a review task shows a diff when the earlier text is kept, else its text and a note', () => {
  const [first, second] = needsContextItems.find((i) => i.kind === 'review')?.tasks ?? []
  assert.ok(first && second, 'the review group has two tasks')
  const changed = reviewEvidence(first.title, first.context)
  assert.equal(changed?.kind, 'diff')
  assert.ok(changed?.kind === 'diff' && changed.lines.some((l) => l.kind === 'add'))
  const fresh = reviewEvidence(second.title, second.context)
  assert.equal(fresh?.kind, 'text')
  assert.match(fresh?.kind === 'text' ? fresh.note : '', /no diff/)
  const source = second.context?.source
  assert.ok(source, 'the second task names its source')
  assert.equal(sourceLine(source), '.kiro/specs/recipe-search/tasks.md · lines 40–43')
})

test('every item kind says what is asked, and a task item says what it unblocks', () => {
  for (const item of needsContextItems) assert.ok(askLine(item).length > 10, item.kind)
  assert.match(unblockLine(needsContextItems[0]) ?? '', /Query parser \(search\.4\)/)
  // The fixture's item that `pick` finds.
  const item = (pick: (i: ConflictItem) => boolean) => {
    const found = needsContextItems.find(pick)
    assert.ok(found, 'the fixture has the item')
    return found
  }
  assert.deepEqual(evidenceOf(item((i) => i === needsContextItems.at(-1))), [], 'the bare item has no evidence')
  assert.ok(evidenceOf(item((i) => i.reason === 'pr-merge')).includes('links'))
  assert.deepEqual(evidenceOf(item((i) => i.kind === 'stale-session')), ['checks'], 'a stop on failed checks shows them')
})

test('Resolve comes after the context block, and the review drawer lists text before Mark reviewed', () => {
  const view = source('ConflictsView.tsx')
  assert.ok(view.indexOf('<ItemContextBlock') < view.indexOf('data-conflict-resolve'))
  const drawer = source('TaskDrawer.tsx')
  assert.ok(drawer.indexOf('<ReviewTaskContext') < drawer.indexOf('<ReviewButton item={group}'))
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Needs you context tests'
let harness: Harness, page: Page
withChrome(chrome, (got) => ({ harness, page } = got))

test('each kind draws its spec link, evidence and context before Resolve', { skip }, async () => {
  await page.open(harness.url({ page: 'app', needsctx: '1' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-top-row]'))`, 30000)
  await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Needs you')).click()`)
  await page.until(`Boolean(document.querySelector('[data-nav-item="waiting/decisions"]'))`, 30000)
  await page.evaluate(`document.querySelector('[data-nav-item="waiting/decisions"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-conflict-list]'))`, 30000)
  const rows = await page.evaluate<{ spec: boolean; reason: boolean }[]>(
    `[...document.querySelectorAll('[data-conflict-row]')].map((r) => ({ spec: Boolean(r.querySelector('[data-spec-link]')), reason: Boolean(r.querySelector('[data-row-reason]')) }))`,
  )
  assert.equal(rows.length, needsContextItems.length)
  assert.ok(
    rows.slice(0, 4).every((r) => r.spec && r.reason),
    'each row shows a spec link and a reason',
  )
  const picks = await page.evaluate<string[]>(`[...document.querySelectorAll('[data-conflict-pick]')].map((b) => b.dataset.conflictPick)`)
  for (const key of picks) {
    await page.evaluate(`document.querySelector('[data-conflict-pick=${JSON.stringify(key)}]').click()`)
    await page.until(`document.querySelector('[data-conflict-detail]')?.dataset.conflictDetail === ${JSON.stringify(key)}`, 30000)
    const kind = key.split(':')[0]
    const got = await page.evaluate<{ context: boolean; before: boolean; asked: boolean; evidence: boolean }>(
      `(() => { const d = document.querySelector('[data-conflict-detail]'), c = d.querySelector('[data-needs-context]'), r = d.querySelector('[data-conflict-resolve]'); return { context: Boolean(c), before: !r || Boolean(c.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING), asked: Boolean(c?.querySelector('[data-context-section="asked"]')), evidence: Boolean(c?.querySelector('[data-context-section="evidence"]')?.textContent.trim()) } })()`,
    )
    assert.ok(got.context && got.before && got.asked && got.evidence, `${kind}: ${JSON.stringify(got)}`)
    if (kind !== 'needs-human')
      assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-conflict-detail] [data-context-where] [data-spec-link]'))`), true, `${kind}: spec link`)
    if (kind === 'review') assert.equal(await page.evaluate(`document.querySelectorAll('[data-diff]').length > 0`), true, 'the review shows a diff')
    if (key.includes(':search.2:')) assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-pr-chip]') && document.querySelector('[data-branch-chip]'))`), true)
    if (key.includes(':search.8:')) assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-no-evidence]'))`), true)
    if (kind === 'stale-session') {
      const shown = await page.evaluate<string>(`document.querySelector('[data-conflict-detail] [data-failed-checks]')?.textContent ?? ''`)
      assert.match(shown, /test \(ubuntu-latest\)/)
      assert.match(shown, /expected 3 saved searches, got 2/)
    }
  }
})

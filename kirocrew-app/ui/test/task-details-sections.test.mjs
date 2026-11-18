// Task details show every section at once: each a bordered, titled box
// whose header button folds it (aria-expanded; Enter and Space work), all
// open at first. The source check runs anywhere; the page check runs in a
// real Chrome (AVOOZL_CHROME, or an installed one) and is skipped without.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('every drawer section is a SectionBox, open at first, inside the shared tab bar', () => {
  const drawer = source('TaskDrawer.tsx')
  for (const key of ['summary', 'description', 'links', 'task-links', 'delivery', 'timing', 'conflicts', 'timeline', 'review', 'fields'])
    assert.match(drawer, new RegExp(`<SectionBox id="${key}" title=`), key)
  // Files and Evidence draw their own box, and nothing when they have no data.
  for (const key of ['files', 'evidence']) assert.match(drawer, new RegExp(`box=\\{\\{ id: '${key}'`), key)
  // The shared tab bar (Tabs.tsx), not a pattern of its own.
  assert.match(drawer, /<Tabs id="task-tabs"/)
  assert.doesNotMatch(drawer, /<Fold\b|<details\b|SegmentedControl|role="tab/)
  // Opening one never closes another, and none starts closed.
  assert.doesNotMatch(drawer, /<SectionBox[^>]*open=\{/)
  const controls = source('controls.tsx')
  const box = controls.slice(controls.indexOf('export function SectionBox'), controls.indexOf('// A row of picture-less radio cards'))
  assert.match(box, /useState\(props\.open \?\? true\)/)
  assert.match(box, /<Card className=/)
  assert.match(box, /<button\s+type="button"\s+aria-expanded=\{open\}\s+aria-controls=\{body\}/)
  assert.match(box, /hidden=\{!open\}/)
  assert.doesNotMatch(box, /warning|yellow|#[0-9a-f]{3,6}/i)
})

test('every place that opens task details uses the one drawer', () => {
  for (const name of ['GraphView.tsx', 'PlansView.tsx', 'DashboardView.tsx', 'ConflictsView.tsx', 'FlowView.tsx', 'ActivityView.tsx', 'FocusTree.tsx'])
    assert.match(source(name), /drawer\.openTask\(/, name)
  // Only the drawer and Needs you's history read a task's detail.
  for (const name of ['GraphView.tsx', 'PlansView.tsx', 'DashboardView.tsx', 'FlowView.tsx']) assert.doesNotMatch(source(name), /tasks\.detail\(/, name)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the task details page test'
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

const BOXES = `[...document.querySelectorAll('[data-section-box]')].map((box) => {
  const button = box.querySelector('h3 > button[aria-expanded]')
  const body = button && document.getElementById(button.getAttribute('aria-controls'))
  return { id: box.dataset.sectionBox, title: button?.textContent.trim() ?? '', expanded: button?.getAttribute('aria-expanded'), hidden: body ? body.hidden : null }
})`

test('page: every tab shows its sections, each header folds by click and by keyboard (Space)', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light' }), { width: 1280, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`document.querySelectorAll('[data-section-box]').length >= 2`)
  const want = { overview: ['summary', 'links'], timeline: ['timeline'], links: ['task-links', 'files'], details: ['fields', 'description', 'evidence'] }
  for (const [tab, ids] of Object.entries(want)) {
    await page.evaluate(`document.querySelector('[data-tab="${tab}"]').click()`)
    await page.until(`document.querySelector('[data-tab-panel]').dataset.tabPanel === '${tab}'`)
    await page.until(`${JSON.stringify(ids)}.every((id) => document.querySelector('[data-section-box="' + id + '"]'))`)
    const boxes = await page.evaluate(BOXES)
    assert.deepEqual(boxes.map((b) => b.id), ids, tab)
    for (const box of boxes) {
      assert.ok(box.title, `${box.id} has a header`)
      assert.equal(box.expanded, 'true', `${box.id} starts open`)
      assert.equal(box.hidden, false, `${box.id} body shows`)
    }
    for (const { id } of boxes) {
      const sel = JSON.stringify(`[data-section-toggle="${id}"]`)
      await page.evaluate(`document.querySelector(${sel}).click()`)
      await page.until(`document.querySelector(${sel}).getAttribute('aria-expanded') === 'false'`)
      const now = await page.evaluate(BOXES)
      assert.equal(now.find((b) => b.id === id).hidden, true, `${id} body hides`)
      assert.ok(now.filter((b) => b.id !== id).every((b) => b.expanded === 'true'), `${id} closed another box`)
      await page.evaluate(`document.querySelector(${sel}).focus()`)
      await page.key(' ', 'Space', 32)
      await page.until(`document.querySelector(${sel}).getAttribute('aria-expanded') === 'true'`)
    }
  }
  assert.deepEqual(page.errors, [])
})

// Links: the fields stay hidden behind Add link, open for one link, and
// close again after Add, so each further link is one click.
test('page: Add link shows one set of fields and closes after adding', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light' }), { width: 1280, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`Boolean(document.querySelector('[data-tab="links"]'))`)
  await page.evaluate(`document.querySelector('[data-tab="links"]').click()`)
  await page.until(`document.querySelectorAll('[data-link-entry]').length === 2`)
  const box = `document.querySelector('[data-section-box="task-links"]')`
  const shape = `({ forms: ${box}.querySelectorAll('[data-add-link-form]').length, inputs: ${box}.querySelectorAll('input:not([type=checkbox])').length, button: Boolean(${box}.querySelector('[data-add-link]')) })`
  assert.deepEqual(await page.evaluate(shape), { forms: 0, inputs: 0, button: true })
  await page.evaluate(`${box}.querySelector('[data-add-link]').click()`)
  await page.until(`Boolean(${box}.querySelector('[data-add-link-form]'))`)
  assert.deepEqual(await page.evaluate(shape), { forms: 1, inputs: 2, button: false })
  // Cancel closes it with nothing sent.
  await page.evaluate(`[...${box}.querySelectorAll('[data-add-link-form] button')].find((b) => b.textContent.trim() === 'Cancel').click()`)
  await page.until(`!${box}.querySelector('[data-add-link-form]')`)
  await page.evaluate(`${box}.querySelector('[data-add-link]').click()`)
  await page.until(`Boolean(${box}.querySelector('[data-add-link-form]'))`)
  // The same check as before: a bad link is refused in place.
  await page.evaluate(`${box}.querySelector('[data-add-link-submit]').click()`)
  await page.until(`${box}.textContent.includes('Give a link.')`)
  for (const [i, value] of [[0, 'https://docs.example.test/plan'], [1, 'Plan doc']])
    await page.evaluate(`(() => {
      const input = ${box}.querySelectorAll('[data-add-link-form] input')[${i}]
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
  await page.evaluate(`${box}.querySelector('[data-add-link-submit]').click()`)
  await page.until(`!${box}.querySelector('[data-add-link-form]') && Boolean(${box}.querySelector('[data-add-link]'))`)
  const sent = await page.evaluate(`window.__harness.calls.filter((c) => c.operation === 'task.notes.add').map((c) => c.input)`)
  assert.deepEqual(sent, [{ taskId: 'team-review', kind: 'link', url: 'https://docs.example.test/plan', label: 'Plan doc' }])
  assert.equal(await page.evaluate(`${box}.textContent.includes('Link added.')`), true)
  assert.deepEqual(page.errors, [])
})

// The Links box (R92.5, R92.9, R92.10): the stored GitHub links open in a
// new tab, the worktree path is text, an old head's checks show stale, and
// the added links keep their Add link button below.
test('page: the Links box shows branch, PR, checks, landed and issue from the stored set', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-drawer', theme: 'light' }), { width: 1280, height: 900 })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog'))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog').click()`)
  await page.until(`Boolean(document.querySelector('[data-tab="links"]'))`)
  await page.evaluate(`document.querySelector('[data-tab="links"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-section-box="task-links"] [data-scm-links]'))`)
  // The added links arrive in a read of their own, after the stored set.
  await page.until(`document.querySelectorAll('[data-section-box="task-links"] a').length >= 6`)
  const read = await page.evaluate(`(() => {
    const box = document.querySelector('[data-section-box="task-links"]')
    const scm = box.querySelector('[data-scm-links]')
    const rows = Object.fromEntries([...scm.querySelectorAll('dt')].map((dt) => [dt.textContent.trim(), dt.nextElementSibling.textContent.trim()]))
    return {
      rows,
      anchors: [...box.querySelectorAll('a')].map((a) => [a.target, a.rel]),
      worktreeLinked: Boolean(scm.querySelector('[data-worktree-path]').closest('a')),
      dot: scm.querySelector('[data-checks-dot]').dataset.checksDot,
      addedAfter: Boolean(box.querySelector('[data-scm-links] ~ [data-added-links] [data-add-link]')),
    }
  })()`)
  assert.equal(read.rows.Branch, 'avoozl/team-review')
  assert.match(read.rows.Worktree, /^\/w\/avoozl-worktrees\/team-review/)
  assert.equal(read.rows['Pull request'], 'o/sdk#52 · open')
  assert.match(read.rows.Checks, /^Passed on aaaaaaa, not the current head/)
  assert.equal(read.rows.Landed, undefined, 'a row with no data is not drawn')
  assert.equal(read.rows.Issue, 'o/sdk#47')
  assert.equal(read.dot, 'stale')
  assert.equal(read.worktreeLinked, false)
  assert.equal(read.addedAfter, true)
  assert.ok(read.anchors.length >= 6)
  for (const [target, rel] of read.anchors) assert.deepEqual([target, rel], ['_blank', 'noopener noreferrer'])
  assert.deepEqual(page.errors, [])
})

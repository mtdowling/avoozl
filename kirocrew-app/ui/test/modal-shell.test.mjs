// Every modal has one shell: the item itself is the title, the footer is
// always there with one dismiss button (Cancel in a modal that edits or
// confirms, Close in one that only shows) at its left, and Esc, the X and the
// dismiss button all close it
// with focus back on the opener. The task modal's footer also has "Add task
// after this", which opens the add form with the task as its prerequisite.
// Runs in a real Chrome (AVOOZL_CHROME); skipped without one.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const { draftsGraph } = await import('./browser/graph-chains.ts')
const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the modal shell tests'
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

const TOP = `[...document.querySelectorAll('dialog[data-modal]')].at(-1)`
const settle = () => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
const OPEN = `Boolean(${TOP})`
const CLOSED = `!${TOP}`
const titleOf = () => page.evaluate(`${TOP}.querySelector('[data-modal-header] h2').textContent.replace(/\\s+/g, ' ').trim()`)
const footerButtons = () => page.evaluate(`[...${TOP}.querySelectorAll('[data-modal-footer] button')].map((b) => b.textContent.trim())`)

// The title is the item's, the footer is there, and its first button is the
// one dismiss button, labeled `label`.
async function assertShell(name, title, label = 'Close') {
  const shown = await titleOf()
  if (title instanceof RegExp) assert.match(shown, title, `${name}: the title`)
  else if (title) assert.equal(shown, title, `${name}: the title`)
  else assert.ok(shown.length > 0, `${name}: the title is empty`)
  assert.notEqual(shown, 'Task', `${name}: a generic title`)
  const buttons = await footerButtons()
  assert.equal(buttons[0], label, `${name}: the footer's first button is ${label} (${buttons.join(' | ')})`)
  // One dismiss button: no other Close or Cancel in the box (the header X has
  // no text).
  const dismissals = await page.evaluate(`[...${TOP}.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t === 'Close' || t === 'Cancel')`)
  assert.deepEqual(dismissals, [label], `${name}: exactly one dismiss button`)
  // Inside the screen, left of the footer's other buttons (Edit workspace's
  // Remove sits at the far left, apart from the rest).
  const box = await page.evaluate(`(() => {
    const dialog = ${TOP}
    const close = dialog.querySelector('[data-modal-footer-close]').getBoundingClientRect()
    const others = [...dialog.querySelectorAll('[data-modal-footer] button:not([data-modal-footer-close]):not([data-remove-workspace])')].map((b) => b.getBoundingClientRect())
    return { inside: close.bottom <= innerHeight && close.right <= innerWidth, first: others.every((o) => o.top > close.bottom - 2 || o.left >= close.right - 1) }
  })()`)
  assert.equal(box.inside, true, `${name}: the dismiss button is on the screen`)
  assert.equal(box.first, true, `${name}: the dismiss button sits left of the footer's other buttons`)
  // With a main action (primary or danger), it is the last footer button by
  // position and the dismiss button is not. Alone, the dismiss button is last.
  const order = await page.evaluate(`(() => {
    const buttons = [...${TOP}.querySelectorAll('[data-modal-footer] button')].filter((b) => b.getBoundingClientRect().width > 0 && b.style.order !== '-1')
    const right = buttons.map((b, i) => ({ i, right: b.getBoundingClientRect().right, main: b.hasAttribute('data-primary') || ['primary', 'danger'].includes(b.dataset.variant), close: b.hasAttribute('data-modal-footer-close') }))
    const last = right.reduce((a, b) => (b.right >= a.right ? b : a))
    return { count: right.length, hasMain: right.some((b) => b.main), lastMain: last.main, lastClose: last.close }
  })()`)
  if (order.count === 1) assert.equal(order.lastClose, true, `${name}: a lone dismiss button is last`)
  else if (order.hasMain) {
    assert.equal(order.lastMain, true, `${name}: the main action is the rightmost footer button`)
    assert.equal(order.lastClose, false, `${name}: the dismiss button is not rightmost`)
  }
  // The header X is there too.
  assert.equal(await page.evaluate(`Boolean(${TOP}.querySelector('[data-modal-close]'))`), true, `${name}: the X`)
  // Tab stays inside the modal.
  for (let i = 0; i < 14; i++) await page.key('Tab', 'Tab', 9)
  assert.equal(await page.evaluate(`${TOP}.contains(document.activeElement)`), true, `${name}: focus left the modal`)
}

// Esc, the X and Close each close it; focus goes back to the opener.
async function assertCloses(name, opener) {
  const ways = {
    Esc: () => page.key('Escape', 'Escape', 27),
    X: () => page.evaluate(`${TOP}.querySelector('[data-modal-close]').click()`),
    Close: () => page.evaluate(`${TOP}.querySelector('[data-modal-footer-close]').click()`),
  }
  let first = true
  for (const [, close] of Object.entries(ways)) {
    if (!first) {
      await opener()
      await page.until(OPEN)
      await settle()
    }
    first = false
    await close()
    // A form with something typed asks first; Discard leaves.
    await page.until(`!${TOP} || Boolean(${TOP}.matches('[data-confirm-dialog]'))`)
    if (await page.evaluate(`Boolean(${TOP}?.matches('[data-confirm-dialog]'))`)) await page.evaluate(`${TOP}.querySelector('[data-danger]').click()`)
    await page.until(CLOSED)
  }
  assert.deepEqual(page.errors, [], `${name}: page errors`)
}

// [opener, title, dismiss label]: Cancel where the modal edits or confirms.
const SCENARIOS = {
  'add-plugin': ['Add plugin', null, 'Cancel'],
  onboard: ['Open the dialog', null, 'Cancel'],
  'repo-edit': ['Open the dialog', 'avoozl', 'Cancel'],
  'setup-github': ['Open the dialog', null, 'Cancel'],
  'archive-plan': ['Open the dialog', 'Archive the spec Modal plan?', 'Cancel'],
  'delete-plan': ['Open the dialog', /^Delete the spec /, 'Cancel'],
  confirm: ['Remove', 'Remove avoozl?', 'Cancel'],
  'file-viewer': ['Open the dialog', 'docs/guide.md', 'Close'],
  'stop-line': ['Stop the line', 'Stop the line', 'Cancel'],
  'pack-import': ['Open the dialog', 'Import pack-1 version 1.0.0', 'Cancel'],
  'send-to-radar': ['Open the dialog', null, 'Cancel'],
  'mark-done': ['Open the dialog', 'Mark done: Review with team', 'Cancel'],
  projection: ['Open the dialog', 'Project “Search v2” to GitHub', 'Cancel'],
  'spec-changed': ['Open the dialog', 'Spec changed: Search v2', 'Cancel'],
  'new-spec': ['Open the dialog', 'New spec', 'Cancel'],
  'review-info': ['Open the dialog', 'Meal planner: sections changed', 'Close'],
}

const press = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); b.focus(); b.click(); return true })()`
const hasButton = (text) => `Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}))`

for (const [name, [openerText, title, label]] of Object.entries(SCENARIOS))
  test(`${name}: the title is the item, one ${label} button, Esc, the X and ${label} close it`, { skip }, async () => {
    await page.open(harness.url({ modal: name }), { width: 1280, height: 800 })
    await page.until(hasButton(openerText))
    const opener = () => page.evaluate(press(openerText))
    await opener()
    await page.until(OPEN)
    await settle()
    await assertShell(name, title, label)
    await assertCloses(name, opener)
    // Focus is back on the opener.
    assert.equal(await page.evaluate(`document.activeElement?.textContent.trim()`), openerText, `${name}: focus did not return to the opener`)
  })

test('the shell holds on a phone in the dark theme', { skip }, async () => {
  for (const name of ['confirm', 'mark-done', 'file-viewer', 'review-info', 'new-spec']) {
    const [openerText, title, label] = SCENARIOS[name]
    await page.open(harness.url({ modal: name, theme: 'dark' }), { width: 390, height: 800, dark: true })
    await page.until(hasButton(openerText))
    await page.evaluate(press(openerText))
    await page.until(OPEN)
    await settle()
    await assertShell(`${name} (phone)`, title, label)
  }
})

test('the task modal: the task title with its id, Close, Add task after this', { skip }, async () => {
  await page.open(harness.url({ modal: 'task-drawer' }), { width: 1280, height: 800 })
  await page.until(hasButton('Open the dialog'))
  const opener = () => page.evaluate(press('Open the dialog'))
  await opener()
  await page.until(`Boolean(${TOP}) && ${TOP}.querySelector('[data-modal-header] h2').textContent.includes('Review with team')`)
  await settle()
  await assertShell('task modal', /^Review with team\s*team-review$/)
  assert.equal(await page.evaluate(`${TOP}.querySelector('[data-modal-title-id]').textContent`), 'team-review', 'the id is small beside the title')
  // The body does not repeat the title.
  assert.equal(await page.evaluate(`[...${TOP}.querySelectorAll('[data-modal-body] h2')].some((h) => h.textContent.trim() === 'Review with team')`), false, 'the title repeats in the body')
  assert.deepEqual(await footerButtons(), ['Close', 'Add task after this'])
  // Add task after this: the add form, with this task as its prerequisite.
  await page.evaluate(`[...${TOP}.querySelectorAll('[data-modal-footer] button')].find((b) => b.textContent.trim() === 'Add task after this').click()`)
  await page.until(`${TOP}.querySelector('[data-modal-header] h2').textContent.trim() === 'Add a task'`)
  const body = await page.evaluate(`${TOP}.querySelector('[data-modal-body]').innerText`)
  assert.match(body, /team-review/, 'the prerequisite is set to the task')
  // The add form is a form: its footer says Cancel, and the form has no Cancel of its own.
  assert.equal((await footerButtons())[0], 'Cancel')
  assert.deepEqual(await page.evaluate(`[...${TOP}.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t === 'Cancel' || t === 'Close')`), ['Cancel'])
  await assertCloses('task modal', opener)
})

test('the task modal from Needs you in the full app', { skip }, async () => {
  for (const [width, dark] of [[1280, false], [390, true]]) {
    await page.open(harness.url({ page: 'app', needs: '1', theme: dark ? 'dark' : 'light' }), { width, height: 900, dark })
    const find = `[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Details for Item 1')`
    await page.until(`Boolean(${find})`, 30000)
    await page.evaluate(`(() => { const b = ${find}; b.focus(); b.click(); return true })()`)
    await page.until(`Boolean(${TOP}) && ${TOP}.querySelector('[data-modal-header] h2').textContent.includes('Review with team')`, 30000)
    await settle()
    await assertShell(`Needs you task modal at ${width}`, /^Review with team\s*t1$/)
    assert.deepEqual(await footerButtons(), ['Close', 'Add task after this'])
    await page.key('Escape', 'Escape', 27)
    await page.until(CLOSED)
    assert.equal(await page.evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Details for Item 1', 'focus returns to the opener')
  }
})

test('the Approve dialog keeps its buttons in the footer beside Cancel', { skip }, async () => {
  await page.open(harness.url({ page: 'app', specs: '1', review: '1' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-top-row] [data-nav-head]'))`, 30000)
  await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
  await page.evaluate(`document.querySelector('[data-plan-row="spec:byte-types"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-spec-primary="approve"]'))`, 30000)
  await page.evaluate(`document.querySelector('[data-spec-primary="approve"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-approve-spec]'))`, 30000)
  await settle()
  assert.equal(await page.evaluate(`document.activeElement?.textContent.trim()`), 'Cancel', 'focus starts on the safe button')
  await assertShell('Approve dialog', /^Approve .+\?$/, 'Cancel')
  assert.deepEqual(await footerButtons(), ['Cancel', 'Approve spec'])
  await page.key('Escape', 'Escape', 27)
  await page.until(CLOSED)
})

// A task card opens the full task details; the summary modal is for a
// draft spec's task, which has none yet.
test('the Graph node modal: the node is the title, Close in the footer', { skip }, async () => {
  await page.open(harness.url({ page: 'app', graph: 'drafts' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell]'))`, 30000)
  await page.until(`Boolean(document.querySelector('[data-nav-item="dashboard/graph"]'))`, 30000)
  await page.evaluate(`document.querySelector('[data-nav-item="dashboard/graph"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-frontier]'))`, 30000)
  await page.evaluate(`document.querySelector('[data-frontier-row="S3"] button').click()`)
  await page.evaluate(`[...document.querySelectorAll('[data-frontier-why] button')].find((b) => b.textContent.startsWith('open tree')).click()`)
  await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'task:S3'`)
  await page.evaluate(`document.querySelector('[data-tree-node="M2"]').focus()`)
  await page.key('o', 'KeyO', 79)
  await page.until(OPEN)
  await settle()
  await assertShell('Graph node modal', draftsGraph.drafts.tasks.find((t) => t.id === 'M2').title)
  assert.ok((await footerButtons()).includes('Open tree'))
  await page.key('Escape', 'Escape', 27)
  await page.until(CLOSED)
})

test('the workspace modals', { skip }, async () => {
  await page.open(harness.url({ page: 'workspaces' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-edit-workspace="launch"]'))`)
  await page.evaluate(`document.querySelector('[data-add-workspace]').click()`)
  await page.until(OPEN)
  await settle()
  await assertShell('Add a workspace', 'Add a workspace', 'Cancel')
  await page.key('Escape', 'Escape', 27)
  await page.until(CLOSED)
  await page.evaluate(`document.querySelector('[data-edit-workspace="launch"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-edit-workspace-modal]'))`)
  await settle()
  await assertShell('Edit workspace', /\S/, 'Cancel')
  await page.evaluate(`document.querySelector('[data-remove-workspace]').click()`)
  await page.until(`Boolean(document.querySelector('[data-remove-workspace-confirm]'))`)
  await settle()
  await assertShell('Remove workspace', /^Remove .+ from Avoozl\?$/, 'Cancel')
  await page.key('Escape', 'Escape', 27)
  await page.until(`!document.querySelector('[data-remove-workspace-confirm]')`)
})

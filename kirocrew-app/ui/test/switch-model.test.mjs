// The Switch model dialog in a real Chrome (AVOOZL_CHROME, or an installed
// Chrome or Chromium), on the harness page (test/browser/harness.tsx), which
// answers providers.view, Kiro Crew's /api/models, and a dry run whose set
// grows by one chat after the first Switch. Step 1 picks from dropdowns,
// step 2 is the dry run, Back returns to step 1, and Confirm sends exactly
// the previewed hash; a changed set shows the difference and asks again.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Switch model tests'
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

const DIALOG = `document.querySelector('[data-switch-model]')`
const text = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)
const button = (label) => `[...${DIALOG}.closest('[aria-modal="true"]').querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`
const press = async (label) => {
  await page.until(`Boolean(${button(label)}) && !${button(label)}.disabled`)
  await page.evaluate(`(() => { ${button(label)}.click(); return true })()`)
}
// A React-controlled select or checkbox, set as a person would.
const choose = (id, value) =>
  page.evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)})
    const proto = Object.getPrototypeOf(el)
    Object.getOwnPropertyDescriptor(proto, el.type === 'checkbox' ? 'checked' : 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event(el.type === 'checkbox' ? 'click' : 'change', { bubbles: true }))
    return true
  })()`)
const options = (id) => page.evaluate(`[...document.getElementById(${JSON.stringify(id)}).options].map((o) => o.value)`)

async function openDialog(query = {}) {
  await page.open(harness.url({ modal: 'switch-model', theme: 'light', ...query }), { width: 1280, height: 800, dark: false })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Switch model'))`)
  await page.evaluate(`(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Switch model').click(); return true })()`)
  await page.until(`Boolean(${DIALOG})`)
}

test('Switch model: dropdowns, a dry run, Back, and a confirm that asks again when the set changed', { skip }, async () => {
  await openDialog()
  // The top says what a switch does and what Also new tasks means.
  const intro = await text('[data-switch-intro]')
  assert.match(intro, /next turn/)
  assert.match(intro, /branch and worktree/)
  assert.match(intro, /not lost/)
  assert.match(intro, /Also new tasks/)
  assert.match(intro, /until you undo it/)

  // From and To are dropdowns filled from what is in use and Kiro Crew.
  await page.until(`document.getElementById('avoozl-switch-from-name')?.tagName === 'SELECT'`)
  assert.deepEqual(await options('avoozl-switch-from-name'), ['', 'alpha', 'gamma'])
  await page.until(`document.getElementById('avoozl-switch-to')?.options.length > 2`)
  assert.deepEqual(await options('avoozl-switch-to'), ['', 'auto', 'beta-1', 'alpha-1'])
  assert.equal(await page.evaluate(`Boolean(${DIALOG}.querySelector('input[type="text"], input:not([type]), datalist'))`), false, 'no text inputs')
  await choose('avoozl-switch-from-name', 'alpha')
  await choose('avoozl-switch-to', 'beta-1')
  await choose('avoozl-switch-also-new', true)

  // Step 2: the dry run.
  await press('Preview')
  await page.until(`Boolean(document.querySelector('[data-switch-preview]'))`)
  const preview = await text('[data-switch-preview]')
  for (const word of ['Task a1', 'a1', 'Task a2', 'modal-plan', 'alpha-1', 'beta-1', 'local', 'Task b1', 'remote-1', 'Task b2', 'Moves 2 running chats', '1 stays', '1 new task'])
    assert.ok(preview.includes(word), `the preview shows ${word}`)
  assert.deepEqual(await page.evaluate('window.__switch.previews.at(-1)'), { from: { provider: 'alpha' }, to: 'beta-1', alsoNewTasks: true })
  assert.equal(await page.evaluate('window.__switch.switches.length'), 0, 'a dry run switches nothing')

  // Back keeps the choices.
  await press('Back')
  await page.until(`!document.querySelector('[data-switch-preview]') && Boolean(document.getElementById('avoozl-switch-to'))`)
  assert.equal(await page.evaluate(`document.getElementById('avoozl-switch-from-name').value + ' ' + document.getElementById('avoozl-switch-to').value`), 'alpha beta-1')

  // Confirm sends the previewed hash; the set changed, so it shows the
  // difference and asks again.
  await press('Preview')
  await page.until(`Boolean(document.querySelector('[data-switch-preview]'))`)
  await press('Switch')
  await page.until(`Boolean(document.querySelector('[data-switch-changed]'))`)
  const changed = await text('[data-switch-changed]')
  assert.match(changed, /changed/)
  assert.match(changed, /a3 worker/)
  assert.equal(await page.evaluate('window.__switch.switches.length'), 1)
  assert.equal(await page.evaluate('window.__switch.switches[0].previewHash'), 'h1')

  await press('Switch')
  await page.until(`Boolean(document.querySelector('[data-switch-done]'))`)
  assert.equal(await page.evaluate('window.__switch.switches[1].previewHash'), 'h2')
  const done = await text('[data-switch-done]')
  for (const word of ['Queued 3', 'a1', 'a2', 'a3', 'alpha-1', 'beta-1']) assert.ok(done.includes(word), `the report shows ${word}`)
  assert.deepEqual(page.errors, [])
})

test("Switch model falls back to text when Kiro Crew's model list can't be read, and says so", { skip }, async () => {
  await openDialog({ models: 'fail' })
  await page.until(`document.getElementById('avoozl-switch-to')?.tagName === 'INPUT'`)
  assert.match(await text('[data-switch-to-note]'), /could not be read/)
  // From still reads the running chats.
  await page.until(`document.getElementById('avoozl-switch-from-name')?.tagName === 'SELECT'`)
})

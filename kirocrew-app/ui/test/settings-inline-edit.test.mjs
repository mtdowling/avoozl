// Settings pages edit in place. In Chrome, on the harness app page with a
// stateful backend (?page=app&inline=1), each page must show its fields
// as editable inputs with no Edit or Configure button, show one Save and
// Discard footer only once something changed, refuse a bad value inline,
// and persist through the shared operation with the expected hash. Skipped
// when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Settings inline edit tests'

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

const wait = (ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const click = (selector, text) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
const set = (selector, value) =>
  page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); return true })()`)
const footer = () => page.evaluate(`Boolean(document.querySelector('[data-save-footer]'))`)
const writes = () => page.evaluate(`window.__writes.map((w) => ({ operation: w.operation, input: w.input, workspaceId: w.workspaceId }))`)
const press = (label) => page.evaluate(click('[data-save-footer] button', label))

async function openPage(label, width = 1280, theme = 'light') {
  await page.open(harness.url({ page: 'app', radar: '1', inline: '1', theme }), { width, height: 800, dark: theme === 'dark' })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(200)
  assert.ok(await page.evaluate(click(`${scope} [data-nav-head]`, 'Settings')), 'Settings')
  await wait(200)
  if (width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  assert.ok(await page.evaluate(click(`${scope} [data-nav-item]`, label)), label)
  if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(300)
  await page.until(`Boolean(document.querySelector('[data-settings-body]'))`)
  // Nothing on the page opens a dialog or an editor behind a button.
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-open-settings], [data-settings-dialog]').length`), 0, `${label}: no Configure button or dialog`)
  const labels = await page.evaluate(`[...document.querySelectorAll('[data-settings-body] button')].map((b) => b.textContent.trim())`)
  assert.ok(!labels.some((text) => /^(Edit|Configure)\b/.test(text)), `${label}: no Edit button (${labels.join(' | ')})`)
}

for (const width of [1280, 390]) {
  test(`Delivery edits in place at ${width} px: inline validation, Discard, Save with the hash`, { skip }, async () => {
    await openPage('Delivery', width)
    assert.equal(await footer(), false, 'no footer before a change')
    await page.until(`Boolean(document.getElementById('avoozl-delivery-agent'))`)
    await set('#avoozl-delivery-agent', 'bad agent!')
    await page.until(`Boolean(document.querySelector('[data-save-footer] [data-save-problem]'))`)
    assert.equal(await page.evaluate(`document.querySelector('[data-save-footer] [data-save]').disabled`), true, 'Save waits for a valid value')
    await press('Discard')
    await page.until(`!document.querySelector('[data-save-footer]')`)
    assert.equal(await page.evaluate(`document.getElementById('avoozl-delivery-agent').value`), 'kirocrew-worker')
    await set('#avoozl-delivery-agent', 'my-agent')
    await page.until(`Boolean(document.querySelector('[data-save-footer] [data-save]:not([disabled])'))`)
    await press('Save')
    await page.until(`window.__writes.length === 1`)
    const [call] = await writes()
    assert.equal(call.operation, 'delivery.settings.update')
    assert.equal(call.input.delivery.agent, 'my-agent')
    assert.equal(call.input.expectedHash, 'h1')
    await page.until(`document.getElementById('avoozl-delivery-agent').value === 'my-agent' && !document.querySelector('[data-save-footer] [data-save]')`)
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'no sideways scroll')
    assert.deepEqual(page.errors, [])
  })

  test(`Budgets edits every level in place at ${width} px; one Save writes each changed level`, { skip }, async () => {
    await openPage('Budgets', width)
    await page.until(`Boolean(document.getElementById('budget-workspace-usd'))`)
    assert.equal(await footer(), false)
    await set('#budget-workspace-usd', '-3')
    await page.until(`Boolean(document.querySelector('[data-save-problem]'))`)
    assert.match(await page.evaluate(`document.querySelector('[data-save-problem]').textContent`), /Dollar cap/)
    await set('#budget-workspace-usd', '9')
    await set('#budget-recipe-box-usd', '12')
    await page.until(`Boolean(document.querySelector('[data-save-footer] [data-save]:not([disabled])'))`)
    await press('Save')
    await page.until(`window.__writes.length === 2`)
    const calls = await writes()
    assert.deepEqual(calls.map((c) => [c.operation, c.input.repository ?? null, c.input.budget.usd, c.input.expectedHash]), [
      ['budget.settings.update', null, 9, 'h1'],
      ['budget.settings.update', 'recipe-box', 12, 'h2'],
    ])
    await page.until(`!document.querySelector('[data-save-footer] [data-save]')`)
    assert.deepEqual(page.errors, [])
  })

  test(`Flow edits in place at ${width} px and Save persists`, { skip }, async () => {
    await openPage('Flow', width)
    await page.until(`Boolean(document.getElementById('avoozl-flow-max'))`)
    assert.equal(await footer(), false)
    await set('#avoozl-flow-max', 'x')
    await page.until(`Boolean(document.querySelector('[data-save-problem]'))`)
    await set('#avoozl-flow-max', '3')
    await page.until(`Boolean(document.querySelector('[data-save-footer] [data-save]:not([disabled])'))`)
    await press('Save')
    await page.until(`window.__writes.length === 1`)
    const [call] = await writes()
    assert.equal(call.operation, 'flow.settings.update')
    assert.equal(call.input.flow.batch.max, 3)
    assert.equal(call.input.expectedHash, 'h1')
    assert.deepEqual(page.errors, [])
  })

  test(`Content rules edit in place at ${width} px: one Save writes the set and its words`, { skip }, async () => {
    await openPage('Content rules', width)
    await page.until(`Boolean(document.querySelector('[data-rule-details="codenames"]'))`)
    assert.equal(await footer(), false)
    assert.ok(await page.evaluate(`(() => { const l = [...document.querySelectorAll('[data-rule-details] label')].find((x) => x.textContent.includes('Incoming items')); if (l) l.querySelector('input').click(); return Boolean(l) })()`), 'Incoming items checkbox')
    await page.until(`Boolean(document.querySelector('[data-save-footer]'))`)
    assert.ok(await page.evaluate(click('[data-terms-editor] button, [data-terms-editor] [role="tab"]', 'File view')), 'File view')
    await page.until(`Boolean(document.querySelector('[data-terms-editor] textarea'))`)
    await set('[data-terms-editor] textarea', 'zebra: zebra falcon\nmango: mango tree\n')
    await page.until(`Boolean(document.querySelector('[data-save-footer] [data-save]:not([disabled])'))`)
    await press('Save')
    await page.until(`window.__writes.length === 2`)
    const calls = await writes()
    assert.equal(calls[0].operation, 'content.sets.update')
    assert.ok(calls[0].input.sets[0].boundaries.includes('intake'))
    assert.equal(calls[0].input.expectedHash, 'h1')
    assert.equal(calls[1].operation, 'content.terms.update')
    assert.match(calls[1].input.text, /mango/)
    await page.until(`!document.querySelector('[data-save-footer] [data-save]')`)
    assert.deepEqual(page.errors, [])
  })

  test(`Repository setup edits a repository in a dialog at ${width} px and Save persists`, { skip }, async () => {
    await openPage('Repository setup', width)
    await page.until(`Boolean(document.querySelector('[data-repository-list]'))`)
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-repository-list] input, [data-repository-list] select').length`), 0, 'no fields in the list')
    assert.ok(await page.evaluate(`(() => { const b = document.querySelector('[data-repository-list] button[aria-label="Edit recipe-box"]'); if (b) b.click(); return Boolean(b) })()`))
    await page.until(`Boolean(document.getElementById('avoozl-settings-repo-0-base'))`)
    const save = `[...document.querySelectorAll('dialog[data-repository-edit] [data-modal-footer] button')].find((b) => b.textContent.trim() === 'Save')`
    await set('#avoozl-settings-repo-0-base', 'develop')
    await page.until(`!${save}.disabled`)
    await page.evaluate(`${save}.click()`)
    await page.until(`window.__writes.length === 1`)
    const [call] = await writes()
    assert.equal(call.operation, 'github.settings.update')
    assert.equal(call.input.github.repositories['acme/recipe-box'].baseBranch, 'develop')
    assert.equal(call.input.expectedHash, 'h1')
    assert.deepEqual(page.errors, [])
  })

  test(`Plugins act in place at ${width} px: no dialog, Disable persists`, { skip }, async () => {
    await openPage('Plugins', width)
    await page.until(`Boolean(document.querySelector('[data-plugins-layout]'))`)
    await page.until(`Boolean(document.querySelector('[data-plugins-layout] button'))`)
    assert.ok(await page.evaluate(click('[data-plugins-layout] button', 'Disable')), 'Disable')
    await page.until(`window.__writes.length === 1`)
    const [call] = await writes()
    assert.equal(call.operation, 'plugin.disable')
    assert.deepEqual([call.input.id, call.input.disabled], ['team-pack', true])
    await page.until(`[...document.querySelectorAll('[data-plugins-layout] button')].some((b) => b.textContent.trim() === 'Enable')`)
    assert.deepEqual(page.errors, [])
  })
}

// Crews and rules settings (radar-coder RC7.6): the app's settings style.
// Static checks fail on "same as above", on a model price field and on a
// mode that is not a radio fold-out; the form round-trips the four values;
// a browser check opens each fold-out at 320, 768 and 1280 px.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { emptyRepository, releaseMode, rulesMode, toForm, toPolicy, valueSource } from '../src/settings-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const dir = new URL('../src/', import.meta.url)
const sources = readdirSync(dir)
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => [name, readFileSync(new URL(name, dir), 'utf8')])

test('no settings text says "same as above"', () => {
  // Comments may name the phrase to forbid it; shown text may not.
  for (const [name, text] of sources) assert.doesNotMatch(text.replace(/\/\/.*$/gm, ''), /same as above/i, name)
})

test('no field asks for a model price', () => {
  for (const [name, text] of sources) {
    // Budgets shows Avoozl's built-in price list read only; no label, id,
    // placeholder or field name asks for one.
    assert.doesNotMatch(text, /(label|placeholder|aria-label|raw|id)=\{?["'`][^"'`]*price/i, name)
    assert.doesNotMatch(text, /<Input[^>]*price/i, name)
  }
})

test('Crews and rules modes are radio fold-outs, not selects', () => {
  const text = readFileSync(new URL('../src/CrewsRulesSettings.tsx', import.meta.url), 'utf8')
  assert.equal((text.match(/<RadioFold\b/g) ?? []).length, 2)
  assert.doesNotMatch(text, /<select|type="checkbox"/)
  assert.match(text, /<FieldBox title="How many tasks at once"/)
  assert.match(text, /<FieldBox title="Review rules"/)
  assert.match(text, /<Fold title="Advanced: labels"/)
  // It is a tab of the repository dialog, which is the shared Modal.
  const view = readFileSync(new URL('../src/SettingsView.tsx', import.meta.url), 'utf8')
  assert.match(view, /tab === 'crews'[\s\S]*<CrewsRulesSettings/)
})

test('the four values round-trip and a blank one leaves the file', () => {
  const policy = { mode: 'single-repo', repositories: { 'example/code': { baseBranch: 'main', coder: 'issue-radar', radar: { planLabel: 'to plan', reviewRules: '- Run lint.', clearPlanLabel: true }, release: { capacity: 3, scopes: [{ label: 'x', capacity: 1 }] } } } }
  const form = toForm(policy)
  const repository = form.repositories[0]
  assert.equal(repository.planLabel, 'to plan')
  assert.equal(repository.reviewRules, '- Run lint.')
  assert.equal(repository.releaseCapacity, '3')
  const back = toPolicy(form).repositories['example/code']
  assert.deepEqual(back.radar, policy.repositories['example/code'].radar)
  assert.deepEqual(back.release, policy.repositories['example/code'].release)
  repository.releaseCapacity = ''
  repository.reviewRules = ''
  const cleared = toPolicy(form).repositories['example/code']
  assert.deepEqual(cleared.release, { scopes: [{ label: 'x', capacity: 1 }] })
  assert.equal('reviewRules' in cleared.radar, false)
  const bare = { ...emptyRepository('example/code') }
  assert.equal(toPolicy({ ...form, repositories: [bare] }).repositories['example/code'].release, undefined)
})

test('each value says where it comes from and what it is', () => {
  assert.equal(valueSource('', 'to plan'), 'Not set on this repository. Using the default (to plan).')
  assert.equal(valueSource('3', '2', ' at a time'), 'Set on this repository: 3 at a time.')
  assert.equal(releaseMode({ releaseCapacity: '' }), 'default')
  assert.equal(releaseMode({ releaseCapacity: '4' }), 'number')
  assert.equal(rulesMode({ reviewRules: ' ' }), 'default')
  assert.equal(rulesMode({ reviewRules: 'x' }), 'custom')
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Crews and rules page tests'
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

for (const width of [320, 768, 1280])
  test(`at ${width} px each mode opens its fields and the default shows its source`, { skip }, async () => {
    await page.open(harness.url({ page: 'crews-rules' }), { width, height: 900, dark: false })
    await page.until(`document.querySelectorAll('[data-radio-fold]').length === 2`)
    assert.match(await page.evaluate(`document.querySelector('[data-radio-section="default"][data-open="true"]').textContent`), /Using the default \(2 at a time\)/)
    assert.equal(await page.evaluate(`document.querySelectorAll('input[type=radio]:checked').length`), 2)
    // Pick "Set a number": the field appears with its source line.
    await page.evaluate(`document.getElementById('t-release-mode-number').click()`)
    await page.until(`Boolean(document.getElementById('t-capacity'))`)
    assert.match(await page.evaluate(`document.getElementById('t-capacity-source').textContent`), /Set on this repository: 2 at a time\./)
    await page.evaluate(`document.getElementById('t-rules-mode-custom').click()`)
    await page.until(`Boolean(document.getElementById('t-rules'))`)
    assert.match(await page.evaluate(`document.querySelector('[data-form]').textContent`), /"capacity":"2"/)
    // Back to the default clears the value.
    await page.evaluate(`document.getElementById('t-release-mode-default').click()`)
    await page.until(`document.querySelector('[data-form]').textContent.includes('"capacity":""')`)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    assert.deepEqual(page.errors, [])
  })

// Settings > Delivery layout: each field names its default, an overridden
// field has Reset to default, and a field that does nothing under another's
// value is disabled with the reason. Skipped without Chrome.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Delivery settings tests'

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
const click = (selector, text) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((x) => x.textContent.trim() === ${JSON.stringify(text)}).at(-1); if (b) b.click(); return Boolean(b) })()`
const set = (selector, value) =>
  page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); return true })()`)
const text = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)

async function openDelivery(width) {
  await page.open(harness.url({ page: 'app', inline: '1', theme: 'light' }), { width, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(200)
  await page.evaluate(`(() => { const b = [...document.querySelectorAll('${scope} [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return true })()`)
  await wait(200)
  if (width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  assert.ok(await page.evaluate(click(`${scope} [data-nav-item]`, 'Delivery')), 'Delivery nav item')
  await page.until(`Boolean(document.getElementById('avoozl-delivery-rounds'))`)
}

for (const width of [1280, 390]) {
  test(`Delivery fields name their default, reset and disable with a reason at ${width} px`, { skip }, async () => {
    await openDelivery(width)
    // Every field row says what a blank value uses.
    for (const id of ['agent', 'model', 'investigate', 'confidence', 'rounds'])
      assert.match((await text(`[data-field-row="avoozl-delivery-${id}"] [data-field-default]`)) ?? '', /^Default: /, id)
    // The fixture saves 3 rounds: an override, so Reset shows and clears it.
    assert.equal(await text('[data-field-reset="avoozl-delivery-rounds"]'), 'Reset to default (5)')
    assert.equal(await text('[data-field-reset="avoozl-delivery-agent"]'), null, 'agent at its default has no Reset')
    await page.evaluate(`document.querySelector('[data-field-reset="avoozl-delivery-rounds"]').click()`)
    await page.until(`document.getElementById('avoozl-delivery-rounds').value === '' && !document.querySelector('[data-field-reset="avoozl-delivery-rounds"]')`)
    // Feedback off disables the rounds box and says why.
    await page.evaluate(`document.querySelector('[data-check-row="delivery.prFeedback"] input').click()`)
    await page.until(`document.getElementById('avoozl-delivery-rounds').disabled`)
    assert.match((await text('[data-field-row="avoozl-delivery-rounds"] [data-field-help]')) ?? '', /Off while pull request feedback is off/)
    // Investigate Off disables Sure enough at and says why.
    await set('#avoozl-delivery-investigate', 'off')
    await page.until(`document.getElementById('avoozl-delivery-confidence').disabled`)
    assert.match((await text('[data-field-row="avoozl-delivery-confidence"] [data-field-help]')) ?? '', /Off while Which tasks is Off/)
    // The fixture's ship mode is picked.
    assert.equal(await page.evaluate(`document.querySelector('[data-radio-fold="avoozl-delivery-ship"] input:checked')?.value ?? null`), 'manual')
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'no sideways scroll')
  })
}

test('an unknown delivery.ship says so instead of showing no choice', () => {
  const page = readFileSync(new URL('../src/DeliverySettings.tsx', import.meta.url), 'utf8')
  assert.match(page, /data-ship-unknown/)
  assert.match(page, /SHIP_CHOICES\.some\(\(choice\) => choice\.key === form\.ship\)/)
})

// @ts-nocheck: typing debt
// Settings › Flow in the app shell (harness ?page=app&flow=1): there is no
// Batching box (R108.8) and no native dropdown, and Save sits last in a
// footer that stays in view. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.ts'
import { findChrome, launch } from './browser/chrome.ts'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Settings › Flow layout tests'

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
const click = (selector, text) =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`

async function openFlowSettings(width) {
  await page.open(harness.url({ page: 'app', basic: '1', flow: '1' }), { width, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(200)
  assert.ok(await page.evaluate(click(`${scope} [data-nav-head]`, 'Settings')))
  await wait(200)
  if (width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await page.evaluate(click(`${scope} [data-nav-item]`, 'Flow'))
  if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(300)
  assert.equal(await page.evaluate(click('button', 'Configure flow')), false, 'Flow has no Configure button')
  await page.until(`Boolean(document.querySelector('[data-flow-settings]'))`)
  // The footer appears once a field changes.
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-save-footer]'))`), false, 'no footer before a change')
  await page.evaluate(`[...document.querySelectorAll('[data-check-row]')].find((x) => x.textContent.includes('Require a local pass')).querySelector('[role="switch"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-save-footer]'))`)
}

const READ = `(() => {
  const root = document.querySelector('[data-flow-settings]')
  const r = (el) => el.getBoundingClientRect()
  const footer = document.querySelector('[data-save-footer]')
  const buttons = [...footer.querySelectorAll('button')]
  return {
    selects: root.querySelectorAll('select').length,
    batching: /Batching|Most tasks per run|Group by/.test(root.textContent),
    footerInView: r(footer).bottom <= innerHeight + 1 && r(footer).top >= 0,
    buttons: buttons.map((b) => b.textContent.trim()),
    lastButton: buttons.at(-1)?.textContent.trim(),
    lastPrimary: buttons.at(-1)?.hasAttribute('data-primary'),
  }
})()`

for (const width of [390, 1280])
  test(`Settings › Flow keeps a Save footer at ${width} px`, { skip }, async () => {
    await openFlowSettings(width)
    const before = await page.evaluate(READ)
    assert.equal(before.selects, 0, 'no native dropdown')
    assert.equal(before.batching, false, 'no Batching box')
    assert.deepEqual(before.buttons, ['Discard', 'Save'])
    assert.equal(before.lastButton, 'Save')
    assert.ok(before.lastPrimary, 'Save is the primary button')
    assert.ok(before.footerInView, 'the footer is in view before scrolling')
    await page.evaluate(
      `(() => { for (let el = document.querySelector('[data-flow-settings]'); el; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight / 2; window.scrollTo(0, document.documentElement.scrollHeight / 2); return true })()`,
    )
    await wait(100)
    assert.ok((await page.evaluate(READ)).footerInView, 'the footer stays in view while the groups scroll')
  })

// Home's Driver status is one compact cell: a dot and a short title
// ("Driver: not started"), the actions beside it, the long explanation in the
// title's tooltip. Radar's crew cell is gone with Radar. Measured in a real
// Chrome at 1280 px light and 390 px dark. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the status cells test'

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

const SIZES = [
  { width: 1280, theme: 'light', dark: false },
  { width: 390, theme: 'dark', dark: true },
]
const open = async (size) => {
  await page.open(harness.url({ page: 'app', radar: '1', theme: size.theme }), { width: size.width, height: 800, dark: size.dark })
  await page.until(`document.querySelectorAll('[data-sc]').length === 1`)
}
const cells = `[...document.querySelectorAll('[data-sc]')].map((el) => { const r = el.getBoundingClientRect(); const line = parseFloat(getComputedStyle(el).lineHeight); return { right: r.right, height: r.height, line, text: el.textContent.trim().replace(/\\s+/g, ' ') } })`

for (const size of SIZES) {
  test(`the Driver cell is one line at ${size.width} px ${size.theme}, and there is no Radar crew cell`, { skip }, async () => {
    await open(size)
    const [driver] = await page.evaluate(cells)
    assert.match(driver.text, /^Driver: not started/)
    assert.ok(driver.right <= size.width + 0.5, 'nothing past the right edge')
    assert.ok(driver.height <= 38, `the cell is ${driver.height}px tall`)
    const body = await page.evaluate(`document.body.innerText`)
    assert.doesNotMatch(body, /Radar crew/)
    assert.doesNotMatch(body, /Workspace: /)
    assert.doesNotMatch(body, /Nothing is released and nobody watches/)
    // The long text is the tooltip, and the actions are small icon buttons.
    const tips = await page.evaluate(`[...document.querySelectorAll('[data-sc]')].map((el) => el.dataset.tip)`)
    assert.match(tips[0], /Nothing is released and nobody watches merges/)
    const actions = await page.evaluate(`[...document.querySelectorAll('[data-sc-act]')].map((el) => el.getAttribute('aria-label'))`)
    assert.deepEqual(actions, ['Start a driver session', 'Recheck'])
    const small = await page.evaluate(`Math.max(...[...document.querySelectorAll('[data-sc-act]')].map((el) => el.getBoundingClientRect().height))`)
    assert.ok(small < 32, `buttons are ${small}px`)
    assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-sc-act]')].every((el) => el.textContent.trim() === '' && el.querySelector('svg'))`), true)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  })
}

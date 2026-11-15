// Home's Driver and Radar crew status are two compact cells in one row: a dot
// and a short title ("Driver: not started"), the actions beside it, the long
// explanation in the title's tooltip. Side by side from 300 px, stacked below.
// Measured in a real Chrome at 1280 px light and 390 px dark. Skipped when no
// Chrome is found.
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
  await page.until(`document.querySelectorAll('[data-sc]').length === 2`)
}
const cells = `[...document.querySelectorAll('[data-sc]')].map((el) => { const r = el.getBoundingClientRect(); const line = parseFloat(getComputedStyle(el).lineHeight); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, line, text: el.textContent.trim().replace(/\\s+/g, ' ') } })`

for (const size of SIZES) {
  test(`Driver and Radar crew sit side by side in about three lines at ${size.width} px ${size.theme}`, { skip }, async () => {
    await open(size)
    const [driver, crew] = await page.evaluate(cells)
    assert.match(driver.text, /^Driver: not started/)
    assert.match(crew.text, /^Radar crew: none/)
    // Left and right of each other, in the same band, inside the screen.
    assert.ok(driver.right <= crew.left + 0.5, 'the driver is left of the crew')
    assert.ok(Math.min(driver.bottom, crew.bottom) > Math.max(driver.top, crew.top), 'they share a row')
    assert.ok(crew.right <= size.width + 0.5, 'nothing past the right edge')
    const band = Math.max(driver.bottom, crew.bottom) - Math.min(driver.top, crew.top)
    assert.ok(band <= driver.line * 4.5 + (size.width <= 640 ? 44 : 0), `both together are ${band}px, about ${(band / driver.line).toFixed(1)} lines`)
    // No separate explanation paragraph or workspace line: only the tooltip carries them.
    const body = await page.evaluate(`document.body.innerText`)
    assert.doesNotMatch(body, /Workspace: /)
    assert.doesNotMatch(body, /Nothing is released and nobody watches/)
    // The long text is the tooltip, and the actions are small buttons.
    const tips = await page.evaluate(`[...document.querySelectorAll('[data-sc]')].map((el) => el.dataset.tip)`)
    assert.match(tips[0], /Nothing is released and nobody watches merges/)
    assert.match(tips[1], /Issue Radar crews code the issues Avoozl releases/)
    const actions = await page.evaluate(`[...document.querySelectorAll('[data-sc-act]')].map((el) => (el.getAttribute('aria-label') || el.textContent).trim())`)
    assert.deepEqual(actions, ['Start', 'Recheck', 'Copy values', 'Open Radar'])
    const small = await page.evaluate(`Math.max(...[...document.querySelectorAll('[data-sc-act]')].map((el) => el.getBoundingClientRect().height))`)
    assert.ok(small < 32, `buttons are ${small}px`)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  })
}

test('the cells stack when the row is narrower than 300 px', { skip }, async () => {
  await open(SIZES[0])
  await page.evaluate(`document.querySelector('[data-sc-row]').style.width = '280px'`)
  const [driver, crew] = await page.evaluate(cells)
  assert.ok(crew.top >= driver.bottom - 0.5, 'the crew cell is under the driver cell')
  await page.evaluate(`document.querySelector('[data-sc-row]').style.width = '320px'`)
  const [left, right] = await page.evaluate(cells)
  assert.ok(left.right <= right.left + 0.5, 'side by side again at 320 px')
})

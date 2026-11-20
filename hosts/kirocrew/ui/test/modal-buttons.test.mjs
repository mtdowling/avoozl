// Modal footer buttons: a form modal says Cancel, a view modal says Close,
// the destructive button is the theme's danger variant (background and text
// set together, readable in light and dark), and the main action sits
// rightmost. Runs in a real Chrome (AVOOZL_CHROME); skipped without one.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the modal button tests'
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
const open = async (modal, opener, theme = 'light') => {
  await page.open(harness.url({ modal, theme }), { width: 1280, height: 800, dark: theme === 'dark' })
  await page.until(`Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(opener)}))`)
  await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(opener)}).click()`)
  await page.until(`Boolean(${TOP})`)
  await settle()
}
const footer = () => page.evaluate(`[...${TOP}.querySelectorAll('[data-modal-footer] button')].map((b) => b.textContent.trim())`)

test('a form modal says Cancel and a view modal says Close', { skip }, async () => {
  await open('repo-edit', 'Open the dialog')
  assert.equal((await footer())[0], 'Cancel')
  await open('file-viewer', 'Open the dialog')
  assert.equal((await footer())[0], 'Close')
})

for (const theme of ['light', 'dark'])
  test(`the destructive button is the danger variant, readable in ${theme}`, { skip }, async () => {
    await open('confirm', 'Remove', theme)
    assert.deepEqual(await footer(), ['Cancel', 'Remove'], 'Cancel left of the main action')
    const danger = await page.evaluate(`(() => {
      const button = ${TOP}.querySelector('[data-modal-footer] [data-variant="danger"]')
      if (!button) return null
      const rgb = (value) => value.match(/[\\d.]+/g).slice(0, 3).map(Number)
      const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
      const style = getComputedStyle(button)
      const [a, b] = [lum(rgb(style.backgroundColor)), lum(rgb(style.color))].sort((x, y) => y - x)
      return { text: button.textContent.trim(), background: style.backgroundColor, ratio: (a + 0.05) / (b + 0.05), danger: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() }
    })()`)
    assert.ok(danger, 'the destructive button has data-variant="danger"')
    assert.equal(danger.text, 'Remove')
    assert.notEqual(danger.background, 'rgba(0, 0, 0, 0)', 'a filled background')
    assert.ok(danger.ratio >= 4.5, `text on danger has contrast ${danger.ratio.toFixed(2)}`)
  })

test('the main action is the primary variant at the far right', { skip }, async () => {
  await open('archive-plan', 'Open the dialog')
  const last = await page.evaluate(
    `(() => { const all = [...${TOP}.querySelectorAll('[data-modal-footer] button')]; const b = all.at(-1); return { text: b.textContent.trim(), primary: b.hasAttribute('data-primary') || b.dataset.variant === 'primary' } })()`,
  )
  assert.equal(last.text, 'Archive spec')
  assert.equal(last.primary, true)
})

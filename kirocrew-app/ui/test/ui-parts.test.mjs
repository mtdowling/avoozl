// Each Avoozl part in src/ui/ renders what its props say, in light and dark:
// Hint and ErrorText take the theme's muted and danger colors, Stack and Row
// lay out with their gap, and TextLink is underlined. Skipped when no Chrome
// is found.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the parts test'
const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'browser', 'ui-parts.tsx')

let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({ entry })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const read = (part) => `(() => {
  const el = document.querySelector('[data-part="${part}"]')
  const s = getComputedStyle(el)
  const v = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return { tag: el.tagName.toLowerCase(), className: el.className, color: s.color, display: s.display, wrap: s.flexWrap, direction: s.flexDirection, gap: s.rowGap, align: s.alignItems, decoration: s.textDecorationLine, margin: s.marginTop, size: s.fontSize, muted: v('--muted'), danger: v('--danger') }
})()`

const rgb = (hex) => {
  const digits = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1)
  const n = parseInt(digits, 16)
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`
}

for (const theme of ['light', 'dark'])
  test(`the five parts render what their props say in ${theme}`, { skip }, async () => {
    await page.open(harness.url({ theme }), { width: 600, height: 500, dark: theme === 'dark' })
    await page.until(`Boolean(document.querySelector('[data-part="link"]'))`)

    const hint = await page.evaluate(read('hint'))
    assert.equal(hint.tag, 'span')
    assert.equal(hint.color, rgb(hint.muted))

    const small = await page.evaluate(read('hint-p'))
    assert.equal(small.tag, 'p')
    assert.equal(small.size, '12px')
    assert.equal(small.margin, '0px')

    const error = await page.evaluate(read('error'))
    assert.equal(error.tag, 'p')
    assert.equal(error.color, rgb(error.danger))
    const errorSmall = await page.evaluate(read('error-xs'))
    assert.equal(errorSmall.tag, 'span')
    assert.equal(errorSmall.size, '12px')

    const stack = await page.evaluate(read('stack'))
    assert.deepEqual([stack.display, stack.direction, stack.gap], ['flex', 'column', '12px'])

    const row = await page.evaluate(read('row'))
    assert.deepEqual([row.display, row.wrap, row.gap, row.align], ['flex', 'wrap', '8px', 'flex-end'])

    const link = await page.evaluate(read('link'))
    assert.deepEqual([link.tag, link.decoration], ['a', 'underline'])
  })

test('Hint and ErrorText change color between light and dark', { skip }, async () => {
  const colors = {}
  for (const theme of ['light', 'dark']) {
    await page.open(harness.url({ theme }), { width: 600, height: 500, dark: theme === 'dark' })
    await page.until(`Boolean(document.querySelector('[data-part="link"]'))`)
    colors[theme] = [(await page.evaluate(read('hint'))).color, (await page.evaluate(read('error'))).color]
  }
  assert.notEqual(colors.light[0], colors.dark[0])
  assert.notEqual(colors.light[1], colors.dark[1])
})

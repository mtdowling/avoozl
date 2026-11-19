// Every Avoozl modal has Issue Radar's Add crew layout: a fixed header (the
// title and a Close button) over a divider, a body that scrolls on its own,
// and a fixed footer on a darker surface with a divider above it, its buttons
// at the right. It is at most 90% of the screen tall and 660px wide (a wider
// width only where the content asks for one), and full screen on a phone.
// Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

// Without Chrome: no modal builds its own header or button row inside the
// shared Modal's body; each passes `title` (and `footer`).
test('every use of the shared Modal passes a title', () => {
  const dir = new URL('../src/', import.meta.url)
  for (const name of readdirSync(dir).filter((n) => /\.tsx$/.test(n) && n !== 'Modal.tsx')) {
    const text = readFileSync(new URL(name, dir), 'utf8')
    for (const match of text.matchAll(/<Modal\b([\s\S]*?)>\s*\n/g)) assert.match(match[1], /\btitle=/, `${name}: a Modal has no title`)
  }
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the modal layout tests'
const MODALS = ['add-plugin', 'onboard', 'repo-edit', 'setup-github', 'archive-plan', 'delete-plan', 'confirm', 'file-viewer', 'stop-line', 'pack-import', 'mark-done']
const OPENERS = { 'add-plugin': 'Add plugin', confirm: 'Remove', 'stop-line': 'Stop the line' }
const opener = (name) => OPENERS[name] ?? 'Open the dialog'
const findOpener = (name) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(opener(name))})`

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

const READ = `(() => {
  const box = [...document.querySelectorAll('[data-modal-box]')].at(-1)
  const q = (s) => box.querySelector(s)
  const r = (el) => el.getBoundingClientRect()
  const header = q('[data-modal-header]'), body = q('[data-modal-body]'), footer = q('[data-modal-footer]'), close = q('[data-modal-close]')
  const cs = (el) => getComputedStyle(el)
  const buttons = footer ? [...footer.querySelectorAll('button')].filter((b) => r(b).width > 0) : []
  return {
    width: Math.round(r(box).width), height: Math.round(r(box).height), vh: innerHeight, vw: innerWidth,
    left: Math.round(r(box).left), top: Math.round(r(box).top),
    title: header.querySelector('h2')?.textContent.trim() ?? '',
    headerDivider: cs(header).borderBottomWidth, headerHeight: Math.round(r(header).height),
    closeAria: close.getAttribute('aria-label'), closeSize: [Math.round(r(close).width), Math.round(r(close).height)],
    closeInHeader: r(close).top >= r(header).top && r(close).bottom <= r(header).bottom + 1,
    bodyScrolls: cs(body).overflowY === 'auto' || cs(body).overflowY === 'hidden',
    bodyBetween: r(body).top >= r(header).bottom - 1 && (!footer || r(body).bottom <= r(footer).top + 1),
    footer: footer && { divider: cs(footer).borderTopWidth, bg: cs(footer).backgroundColor, boxBg: cs(box).backgroundColor, justify: cs(footer).justifyContent, bottomFlush: Math.abs(r(footer).bottom - r(box).bottom) <= 2, lastRight: Math.round(r(footer).right - r(buttons.at(-1)).right) },
    tallButtons: buttons.filter((b) => r(b).height > 28.5).map((b) => b.textContent.trim()),
    sideways: body.scrollWidth > body.clientWidth + 1,
  }
})()`

for (const name of MODALS)
  for (const [width, height, dark] of [
    [1280, 800, false],
    [1280, 800, true],
    [390, 844, false],
    [390, 844, true],
  ])
    test(`${name} has the header, scrolling body and footer layout at ${width} px ${dark ? 'dark' : 'light'}`, { skip }, async () => {
      await page.open(harness.url({ modal: name, theme: dark ? 'dark' : 'light' }), { width, height, dark })
      await page.until(`Boolean(${findOpener(name)})`)
      await page.evaluate(`${findOpener(name)}.click()`)
      await page.until(`Boolean(document.querySelector('[data-modal-box]'))`)
      await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
      const got = await page.evaluate(READ)
      assert.ok(got.title.length > 0, 'a title')
      assert.equal(got.headerDivider, '1px', 'a divider under the header')
      assert.equal(got.closeAria, 'Close')
      assert.ok(got.closeInHeader, 'the Close button sits in the header')
      assert.deepEqual(got.closeSize, [28, 28])
      assert.ok(got.bodyScrolls && got.bodyBetween, 'the body sits between header and footer and scrolls on its own')
      assert.equal(got.sideways, false, 'no sideways scroll in the body')
      if (got.footer) {
        assert.equal(got.footer.divider, '1px', 'a divider above the footer')
        assert.notEqual(got.footer.bg, got.footer.boxBg, 'the footer is a different surface')
        // Newer Chrome computes flex-end as flow-end; both pack the buttons at the end.
        assert.ok(['flex-end', 'flow-end'].includes(got.footer.justify), `buttons packed at the end (${got.footer.justify})`)
        assert.ok(got.footer.bottomFlush, 'the footer is at the bottom')
        assert.ok(got.footer.lastRight >= 19 && got.footer.lastRight <= 21, `the last button is 20px from the right (${got.footer.lastRight})`)
      }
      assert.deepEqual(got.tallButtons, [], 'no footer button over 28px')
      if (width < 768) assert.deepEqual([got.left, got.top, got.width, got.height], [0, 0, got.vw, got.vh], 'full screen on a phone')
      else {
        assert.ok(got.height <= got.vh * 0.9 + 1, `at most 90% of the screen tall (${got.height} of ${got.vh})`)
        assert.ok(got.width <= got.vw - 63, 'inside the screen')
      }
      assert.deepEqual(page.errors, [])
    })

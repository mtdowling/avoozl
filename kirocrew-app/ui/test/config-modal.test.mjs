// Config opens in a centered modal, never a pull-out from the right. In a
// real Chrome (AVOOZL_CHROME, or an installed one), opened from Settings >
// Repository setup > Configure on the harness app page: centered on a
// desktop, full screen at 390 px, Tab stays inside, Esc and Close close it
// and give focus back. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the config modal tests'
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

const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 80))')
const OPENER = `document.querySelector('[data-open-settings="repositories"]')`
const DIALOG = `document.querySelector('[data-settings-dialog="repositories"]')`

async function start(width, dark = false) {
  await page.open(harness.url({ page: 'app', radar: '1', theme: dark ? 'dark' : 'light' }), { width, height: 800, dark })
  await page.until(`Boolean(document.querySelector('[role="tab"], [data-top-rail-bar]'))`)
  // A phone's tabs are in the top rail's list, once its bar is open.
  await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
  await page.evaluate(`[...document.querySelectorAll('button[role="tab"]')].find((b) => b.textContent.trim() === 'Settings').click()`)
  await page.until(`Boolean(document.querySelector('[data-settings-section="repositories"] button[aria-expanded]'))`)
  await page.evaluate(`document.querySelector('[data-settings-section="repositories"] button[aria-expanded]').click()`)
  await page.until(`Boolean(${OPENER})`)
}
const openDialog = async () => {
  await page.evaluate(`(() => { const b = ${OPENER}; b.focus(); b.click() })()`)
  await page.until(`Boolean(${DIALOG})`)
  await settle()
}

for (const dark of [false, true])
  test(`desktop: config opens in a centered modal, ${dark ? 'dark' : 'light'}; Settings shows a Configure button, not the editor`, { skip }, async () => {
    await start(1280, dark)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-mirror-setup]'))`), false, 'no editor inline')
    await openDialog()
    const box = await page.evaluate(`(() => { const r = ${DIALOG}.querySelector('[data-modal-box]').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight } })()`)
    assert.ok(Math.abs(box.left - (box.w - box.right)) <= 2, 'centered left to right')
    assert.ok(box.right < box.w && box.top > 0 && box.bottom < box.h, 'not flush with any edge')
    assert.equal(await page.evaluate(`Boolean(${DIALOG}.querySelector('[data-mirror-setup]'))`), true, 'the editor is in the modal')
  })

test('phone: the modal is full screen at 390 px', { skip }, async () => {
  await start(390)
  await openDialog()
  const box = await page.evaluate(`(() => { const r = ${DIALOG}.querySelector('[data-modal-box]').getBoundingClientRect(); return { left: r.left, right: r.right, w: innerWidth } })()`)
  assert.equal(box.left, 0)
  assert.equal(box.right, box.w)
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'no sideways scroll')
})

test('Esc and the Close button close it and focus goes back to the opener; Tab stays inside', { skip }, async () => {
  await start(1280)
  await openDialog()
  const inside = `${DIALOG}.contains(document.activeElement)`
  assert.equal(await page.evaluate(inside), true, 'focus starts inside')
  for (let i = 0; i < 40; i++) {
    await page.key('Tab', 'Tab', 9)
    assert.equal(await page.evaluate(inside), true, `Tab ${i + 1} stays inside`)
  }
  await page.key('Escape', 'Escape', 27)
  await page.until(`!${DIALOG}`)
  assert.equal(await page.evaluate(`document.activeElement === ${OPENER}`), true, 'Esc returns focus to the opener')
  await openDialog()
  await page.evaluate(`${DIALOG}.querySelector('[data-modal-close]').click()`)
  await page.until(`!${DIALOG}`)
  assert.equal(await page.evaluate(`document.activeElement === ${OPENER}`), true, 'Close returns focus to the opener')
})

test('no page part opens from the right edge', () => {
  const dir = new URL('../src/', import.meta.url)
  for (const name of readdirSync(dir).filter((f) => /\.tsx$/.test(f) && f !== 'Panel.tsx')) {
    const text = readFileSync(new URL(name, dir), 'utf8')
    assert.doesNotMatch(text, /side="right"|<Shelf\b|justifyContent: 'flex-end' \}\}>/, `${name} opens a pull-out`)
  }
  assert.equal(existsSync(new URL('Shelf.tsx', dir)), false, 'Shelf.tsx is gone')
})

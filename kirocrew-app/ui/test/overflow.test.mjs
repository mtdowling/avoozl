// At 390 px no element is wider than its container, and nothing passes the
// screen's right edge. In a real Chrome (AVOOZL_CHROME) on the Demo sample,
// light and dark, on Home and Needs you. An element inside a box that clips
// or scrolls sideways on purpose (a cut-short line, a wide table's scroller)
// is judged by that box instead. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the overflow test'
let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({ scripts: { 'demo.js': demoScript(await demoReplies()) } })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})
const wait = (ms = 300) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)

// Every element whose box passes its container's right edge, or the screen's.
const OVERFLOWS = `(() => {
  const clips = (el) => { const s = getComputedStyle(el); return /(auto|scroll|hidden|clip)/.test(s.overflowX) }
  const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + ' "' + (el.textContent || '').trim().slice(0, 30) + '"'
  const out = []
  const root = document.querySelector('[data-avoozl-pane]')
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const style = getComputedStyle(el)
    if (style.position === 'fixed' || style.position === 'absolute' || el.closest('.sr-only')) continue
    if (r.right > innerWidth + 1) { out.push('past the screen: ' + name(el) + ' right ' + Math.round(r.right)); continue }
    // The nearest ancestor that does not clip for it: its content box.
    let box = el.parentElement
    let clipped = false
    for (let n = el.parentElement; n && n !== root.parentElement; n = n.parentElement) if (clips(n)) { clipped = true; break }
    if (clipped || !box) continue
    const b = box.getBoundingClientRect()
    const pad = parseFloat(getComputedStyle(box).paddingRight) || 0
    const border = parseFloat(getComputedStyle(box).borderRightWidth) || 0
    if (r.right > b.right - pad - border + 1 && getComputedStyle(box).display !== 'contents') out.push('wider than its container: ' + name(el) + ' in ' + name(box))
  }
  return out.slice(0, 10)
})()`

async function start(dark) {
  await page.open(harness.url({ page: 'demo', theme: dark ? 'dark' : 'light' }), { width: 390, height: 844, dark })
  const startButton = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start demo')`
  await page.until(`Boolean(${startButton})`)
  await page.evaluate(`${startButton}.click()`)
  await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
  await wait(800)
}
async function goto(name) {
  await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(150)
  const key = await page.evaluate(`(() => { const h = [...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes(${JSON.stringify(name)})); h.click(); return h.dataset.navGroup })()`)
  // A section with pages opens in the menu; take its first page.
  await page.evaluate(`document.querySelector('[data-top-rail-list] [data-nav-children="${key}"] [data-nav-item]')?.click()`)
  await wait(800)
}

for (const dark of [false, true])
  test(`at 390 px ${dark ? 'dark' : 'light'}: nothing on Home or Needs you is wider than its container`, { skip }, async () => {
    await start(dark)
    await page.until(`Boolean(document.querySelector('[data-attention-row]'))`, 15000)
    assert.deepEqual(await page.evaluate(OVERFLOWS), [], 'Home')
    // Needs you rows: the tag is inline with the title, on its line.
    const lines = await page.evaluate(`[...document.querySelectorAll('[data-attention-row]')].map((row) => { const title = row.querySelector('[data-attention-title]'); const tag = row.querySelector('[data-attention-tag]'); const a = tag.getBoundingClientRect(), b = title.getBoundingClientRect(); return { ok: a.bottom > b.top && a.top < b.bottom, a: [a.top, a.bottom], b: [b.top, b.bottom] } })`)
    assert.ok(lines.length > 0 && lines.every((l) => l.ok), `each Needs you tag sits on its title line: ${JSON.stringify(lines)}`)
    await goto('Needs you')
    assert.deepEqual(await page.evaluate(OVERFLOWS), [], 'Needs you')
    await page.evaluate(`document.querySelector('[data-conflict-pick]').click()`)
    await wait(400)
    assert.deepEqual(await page.evaluate(OVERFLOWS), [], 'a Needs you item')
  })

#!/usr/bin/env node
// Screenshots of drag to pan in Dashboards › Graph (graph-chains.ts):
// the Focus tree of spec billing at rest (cursor grab), mid left drag on
// empty space (grabbing, scrolled), mid middle drag over a card, and All
// tasks mid middle drag; 1280 px light and dark, and a 390 px phone.
// Headless Chrome draws no mouse pointer, so a marker at the pointer shows
// the computed cursor there.
//
//   node test/browser/focus-tree-drag-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: focus-tree-drag-shots.mjs <out dir>')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS })
const browser = await launch(chrome)

async function openTree(page, { width, height, theme }) {
  await page.open(harness.url({ page: 'app', graph: 'chains', theme }), { width, height, dark: theme === 'dark' })
  await page.until(`Boolean(document.querySelector('[data-shell]'))`)
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
  await page.until(`Boolean(document.querySelector('[data-nav-item="dashboard/graph"]'))`)
  await page.evaluate(`document.querySelector('[data-nav-item="dashboard/graph"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-frontier]'))`)
  await page.evaluate(`(() => { const i = document.querySelector('[data-graph-jump]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'billing'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit(); return true })()`)
  await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'spec:billing'`)
  await page.evaluate('new Promise((r) => setTimeout(r, 250))')
}

// The marker: a dot at the pointer and the cursor CSS gives there.
const mark = (page, x, y) =>
  page.evaluate(`(() => {
    document.querySelector('#shot-pointer')?.remove()
    const cursor = getComputedStyle(document.elementFromPoint(${x}, ${y})).cursor
    const m = document.createElement('div')
    m.id = 'shot-pointer'
    m.style.cssText = 'position:fixed;left:${x - 5}px;top:${y - 5}px;z-index:99999;pointer-events:none;display:flex;align-items:center;gap:6px;font:600 11px ui-monospace,monospace'
    m.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:#e5484d;box-shadow:0 0 0 2px #fff"></span><span style="background:#111;color:#fff;padding:1px 6px;border-radius:3px">cursor: ' + cursor + '</span>'
    document.body.append(m)
    return cursor
  })()`)

// An empty spot in the tree box, in whole pixels, clear of cards.
const empty = (page) =>
  page.evaluate(`(() => {
    const box = document.querySelector('[data-tree-scroll]').getBoundingClientRect()
    const clear = (x, y) => [[0, 0], [-4, 0], [4, 0], [0, -4], [0, 4]].every(([dx, dy]) => {
      const at = document.elementFromPoint(x + dx, y + dy)
      return at && !at.closest('[data-tree-card], [data-tree-edge]') && at.closest('[data-tree-scroll]')
    })
    for (let y = Math.ceil(box.top) + 20; y < box.bottom - 8; y += 6)
      for (let x = Math.floor(box.right) - 40; x > box.left + 8; x -= 6) if (clear(x, y)) return { x, y }
    return null
  })()`)
const center = (page, selector) =>
  page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 3), y: Math.round(r.top + r.height / 2) } })()`)

try {
  const page = await browser.page()
  for (const [width, height, theme] of [
    [1280, 900, 'light'],
    [1280, 900, 'dark'],
    [390, 844, 'light'],
  ]) {
    const shoot = async (name) => {
      const file = path.join(out, `${name}-${width}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
    await openTree(page, { width, height, theme })
    if (width < 768) {
      await shoot('1-phone-tree')
      continue
    }
    const spot = await empty(page)
    if (!spot) throw Error('no empty spot in the tree box')
    await page.hover(spot.x, spot.y)
    console.log('rest', await mark(page, spot.x, spot.y))
    await shoot('1-rest-grab')
    // Left drag on empty space, held.
    await page.drag(spot.x, spot.y, spot.x - 160, 10, spot.y, 'left', false)
    console.log('left', await mark(page, spot.x - 160, spot.y), await page.evaluate(`document.querySelector('[data-tree-scroll]').scrollLeft`))
    await shoot('2-left-drag-grabbing')
    await page.release(spot.x - 160, spot.y)
    // Middle drag that starts on a card, held.
    const card = await center(page, '[data-tree-node="B2"] rect:last-of-type')
    await page.hover(card.x, card.y)
    console.log('card', await mark(page, card.x, card.y))
    await shoot('3-card-pointer')
    await page.drag(card.x, card.y, card.x + 80, 10, card.y, 'middle', false)
    console.log('middle', await mark(page, card.x + 80, card.y), await page.evaluate(`document.querySelector('[data-tree-scroll]').scrollLeft`))
    await shoot('4-middle-drag-over-card')
    await page.release(card.x + 80, card.y, 'middle')
    await page.evaluate(`document.querySelector('#shot-pointer')?.remove()`)
    // All tasks, middle drag held.
    await page.evaluate(`document.querySelector('[data-graph-tab="all"]').click()`)
    await page.until(`Boolean(document.querySelector('[data-graph-view] svg[role="group"]'))`)
    await page.evaluate('new Promise((r) => setTimeout(r, 250))')
    const canvas = await center(page, '[data-graph-view] svg[role="group"]')
    await page.drag(canvas.x, canvas.y, canvas.x + 60, 10, canvas.y + 20, 'middle', false)
    console.log('all', await mark(page, canvas.x + 60, canvas.y + 20))
    await shoot('5-all-tasks-middle-drag')
    await page.release(canvas.x + 60, canvas.y + 20, 'middle')
  }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

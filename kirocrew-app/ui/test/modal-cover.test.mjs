// Every modal covers the whole screen above every layer. In a real Chrome
// (AVOOZL_CHROME, or an installed Chrome or Chromium), each modal opens on
// the harness page (test/browser/harness.tsx): a host header with a high
// z-index, a transformed scroll pane, a sticky column and the Graph. With it
// open, elementFromPoint at the 4 corners and the center hits the modal or
// its backdrop, never the page behind. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

// Runs without Chrome: every modal is the shared Modal, and every z-index
// comes from the one ordered set in layers.ts.
test('every modal is the shared Modal and every z-index is a named layer', async () => {
  const dir = new URL('../src/', import.meta.url)
  const files = readdirSync(dir).filter((name) => /\.tsx?$/.test(name))
  const drawers = ['TaskDrawer.tsx', 'NewPlanDrawer.tsx']
  for (const name of files) {
    const text = readFileSync(new URL(name, dir), 'utf8')
    if (name !== 'Modal.tsx' && !drawers.includes(name)) assert.doesNotMatch(text, /aria-modal|fixed inset-0/, `${name} draws its own modal`)
    assert.doesNotMatch(text, /zIndex: (?!LAYER\.)|\bz-\d|\bz-\[/, `${name} sets a z-index outside layers.ts`)
  }
  const { LAYER } = await import('../src/layers.ts')
  const order = Object.values(LAYER)
  assert.deepEqual(Object.keys(LAYER), ['raised', 'sticky', 'drawer', 'popover', 'tooltip'])
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the layers are in order')
})
const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the modal cover tests'
const MODALS = ['add-plugin', 'onboard', 'repo-edit', 'setup-github', 'archive-plan', 'delete-plan', 'confirm', 'file-viewer', 'stop-line', 'pack-import', 'send-to-radar', 'switch-model', 'mark-done', 'projection', 'spec-changed', 'quick-goal']
const OPENERS = {
  'add-plugin': 'Add plugin',
  onboard: 'Onboard',
  confirm: 'Remove',
  'stop-line': 'Stop the line',
  'switch-model': 'Switch model',
}

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

// The topmost modal (the element with aria-modal, which holds its backdrop
// and its box) and what each probe point hits.
const PROBE = `(() => {
  const layer = [...document.querySelectorAll('[aria-modal="true"]')].at(-1)
  if (!layer) return null
  const w = innerWidth, h = innerHeight
  const points = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [Math.floor(w / 2), Math.floor(h / 2)]]
  const name = (el) => el ? el.tagName.toLowerCase() + Object.keys(el.dataset).map((k) => '[data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ']').join('') : 'nothing'
  return points.map(([x, y]) => {
    const el = document.elementFromPoint(x, y)
    return { x, y, ok: Boolean(el && layer.contains(el)), hit: name(el) }
  })
})()`
const OPEN = `Boolean(document.querySelector('[aria-modal="true"]'))`
const CLOSED = `!document.querySelector('[aria-modal="true"]')`

const opener = (name) => OPENERS[name] ?? 'Open the dialog'
const findOpener = (name) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(opener(name))})`

async function load(name, { width = 1280, height = 800, dark = false, graph = false } = {}) {
  await page.open(harness.url({ modal: name, theme: dark ? 'dark' : 'light' }), { width, height, dark })
  await page.until(`Boolean(${findOpener(name)})`)
  if (graph) {
    // The Graph's canvas under the center, the sticky column stuck.
    await page.until(`Boolean(document.querySelector('[data-graph] svg'))`)
    await page.evaluate(`(() => {
      const pane = document.querySelector('[data-host-pane]')
      const svg = document.querySelector('[data-graph] svg').getBoundingClientRect()
      pane.scrollTop += svg.top + svg.height / 2 - innerHeight / 2
      return pane.scrollTop
    })()`)
  }
}

async function open(name) {
  await page.evaluate(`(() => { const b = ${findOpener(name)}; b.focus(); b.click(); return true })()`)
  await page.until(OPEN)
  // A frame for focus and layout to settle.
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
}

async function covers(name, label) {
  const points = await page.evaluate(PROBE)
  assert.ok(points, `${name} ${label}: no modal open`)
  const missed = points.filter((p) => !p.ok)
  assert.deepEqual(missed, [], `${name} ${label}: these points hit the page behind`)
}

for (const name of MODALS) {
  test(`${name} covers the screen above every layer and closes like a modal`, { skip }, async () => {
    for (const graph of [false, true]) {
      const label = graph ? 'over the Graph and the sticky column' : 'at the top of the page'
      await load(name, { graph })
      await open(name)
      await covers(name, label)
      const where = await page.evaluate(`(() => {
        const box = [...document.querySelectorAll('[aria-modal="true"]')].at(-1)
        const dialog = box.closest('dialog')
        return { portaled: dialog?.parentElement === document.body, modal: Boolean(dialog?.matches(':modal')), focused: box.contains(document.activeElement) }
      })()`)
      assert.deepEqual(where, { portaled: true, modal: true, focused: true }, `${name} ${label}: portaled to body, on the top layer, focus inside`)
    }

    // Scroll behind it is locked: a wheel over the backdrop moves nothing.
    const before = await page.evaluate(`document.querySelector('[data-host-pane]').scrollTop + ':' + document.scrollingElement.scrollTop`)
    await page.wheel(3, 400, 300)
    await page.wheel(640, 400, 300)
    await page.evaluate('new Promise((r) => setTimeout(r, 150))')
    assert.equal(await page.evaluate(`document.querySelector('[data-host-pane]').scrollTop + ':' + document.scrollingElement.scrollTop`), before, `${name}: the page scrolled behind the modal`)

    // Esc closes it, and focus goes back to the button that opened it.
    await page.key('Escape')
    await page.until(CLOSED)
    assert.equal(await page.evaluate(`document.activeElement === ${findOpener(name)}`), true, `${name}: focus did not return to the opener`)

    // A click outside closes it.
    await open(name)
    await page.click(2, 2)
    await page.until(CLOSED)

    // Full screen on a narrow page.
    await load(name, { width: 320, height: 640 })
    await open(name)
    await covers(name, 'at 320px')
    const rect = await page.evaluate(`(() => { const modal = [...document.querySelectorAll('[aria-modal="true"]')].at(-1); const r = (modal.querySelector('[data-modal-box]') ?? modal).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round) })()`)
    assert.deepEqual(rect, [0, 0, 320, 640], `${name}: not full screen at 320px`)
    assert.deepEqual(page.errors, [], `${name}: page errors`)
  })
}

test('Esc and a click outside ask first when there are unsaved changes', { skip }, async () => {
  await load('repo-edit-unsaved')
  await open('repo-edit-unsaved')
  for (const leave of [() => page.key('Escape'), () => page.click(2, 2)]) {
    await leave()
    await page.until(`Boolean(document.querySelector('[data-confirm-dialog]'))`)
    // The confirm is the topmost modal and covers the screen too.
    await covers('repo-edit-unsaved', 'its confirm')
    await page.key('Escape')
    await page.until(`!document.querySelector('[data-confirm-dialog]')`)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-modal="avoozl-repo-edit"]'))`), true, 'Cancel on the confirm keeps the dialog open')
  }
  await page.key('Escape')
  await page.until(`Boolean(document.querySelector('[data-confirm-dialog]'))`)
  await page.evaluate(`[...document.querySelectorAll('[data-confirm-dialog] button')].find((b) => b.textContent.trim() === 'Discard changes').click()`)
  await page.until(CLOSED)
  assert.equal(await page.evaluate('window.__harness.closed'), 1)
})

test('a tooltip inside a modal shows above it; the page tooltips stay under it', { skip }, async () => {
  await load('file-viewer')
  await open('file-viewer')
  // Keyboard focus shows a tooltip at once: a key press, then focus.
  await page.key('Shift', 'ShiftLeft', 16)
  await page.evaluate(`(() => { [...document.querySelectorAll('[aria-modal="true"] button')].find((b) => b.getAttribute('aria-label') === 'Copy path').focus(); return true })()`)
  const tip = await page.until(`(() => {
    const tip = document.querySelector('[data-tooltip]')
    return tip && { inModal: Boolean(tip.closest('dialog[open]')), z: getComputedStyle(tip).zIndex }
  })()`)
  // Inside the modal's own top-layer dialog, so above its box; a page
  // tooltip under document.body can never rise above the top layer.
  assert.equal(tip.inModal, true, 'the modal tooltip portals into its modal')
})

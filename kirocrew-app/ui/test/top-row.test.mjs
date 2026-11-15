// In a real Chrome (AVOOZL_CHROME, or an installed Chrome or Chromium), on
// the harness page (test/browser/harness.tsx): the page header (picker,
// Plan a goal, More with Stop the line as an icon) has no Switch model, no
// visible "Stop the line" text and no sideways scroll at 375, 768 and 1280 px,
// light and dark, running and stopped; an In flight title opens the task
// drawer as a Back step. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the top row tests'
// AVOOZL_SHOTS=<dir> keeps a screenshot of each top row size and theme.
const shots = process.env.AVOOZL_SHOTS || null

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

const settle = () => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')

for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1280, 800],
])
  for (const dark of [false, true])
    test(`the header at ${width} px ${dark ? 'dark' : 'light'}: no Switch model, Stop the line an icon in More, no visible Stop the line text; no sideways scroll`, { skip }, async () => {
      for (const stopped of [false, true]) {
        await page.open(harness.url({ app: '1', theme: dark ? 'dark' : 'light', ...(stopped ? { stopped: '1' } : {}) }), { width, height, dark })
        await page.until(`Boolean(document.querySelector('[data-header-actions] [data-more-button]'))`)
        await settle()
        const closed = await page.evaluate(`(() => {
          const pane = document.querySelector('[data-host-pane]')
          return {
            switchModel: [...document.querySelectorAll('button')].some((b) => /Switch model/.test(b.textContent)) || Boolean(document.querySelector('[data-switch-model]')),
            stopOnRow: Boolean(document.querySelector('[data-header-actions] > [data-stop-line], [data-phone-header] > * > [data-stop-line]')),
            sideways: Math.max(document.scrollingElement.scrollWidth, pane.scrollWidth) > innerWidth,
          }
        })()`)
        assert.equal(closed.switchModel, false, 'no Switch model anywhere')
        assert.equal(closed.stopOnRow, false, 'Stop the line is not on the header row')
        assert.equal(closed.sideways, false, 'no sideways scroll')
        if (width < 768) {
          const header = await page.evaluate(`document.querySelector('[data-phone-header]').getBoundingClientRect().height`)
          assert.ok(header <= 56, `the phone header is one row (${header})`)
        }
        await page.evaluate(`document.querySelector('[data-header-actions] [data-more-button]').click()`)
        await page.until(`Boolean(document.querySelector('[data-more-panel] [data-stop-line]'))`)
        if (stopped) await page.until(`Boolean(document.querySelector('[data-more-panel] [data-stop-line][data-stopped]'))`)
        await settle()
        const open = await page.evaluate(`(() => {
          const stop = document.querySelector('[data-more-panel] [data-stop-line]')
          const r = document.querySelector('[data-more-panel]').getBoundingClientRect()
          const visible = []
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement
            const box = el.getBoundingClientRect(), style = getComputedStyle(el)
            if (box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && !el.closest('.sr-only')) visible.push(n.nodeValue.trim())
          }
          return { label: stop.getAttribute('aria-label') ?? stop.textContent.trim(), onScreen: r.left >= 0 && r.right <= innerWidth, texts: visible.filter((t) => /stop the line/i.test(t)) }
        })()`)
        assert.match(open.label, stopped ? /Line stopped/ : /Stop the line/)
        assert.equal(open.onScreen, true, 'the menu is on screen')
        assert.deepEqual(open.texts, [], 'no visible text reads Stop the line')
        if (shots) {
          fs.mkdirSync(shots, { recursive: true })
          await page.screenshot(path.join(shots, `top-row-${width}-${dark ? 'dark' : 'light'}${stopped ? '-stopped' : ''}.png`))
        }
        await page.evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`)
        await settle()
        assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-more-panel]'))`), false, 'a tap outside closes it')
      }
    })

test('an In flight title opens the task drawer, and Back closes it and returns focus', { skip }, async () => {
  await page.open(harness.url({ modal: 'in-flight' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-task-title="a1"]'))`)
  const link = await page.evaluate(`(() => {
    const b = document.querySelector('[data-task-title="a1"]')
    return { tag: b.tagName, text: b.textContent, underline: getComputedStyle(b).textDecorationLine }
  })()`)
  assert.deepEqual(link, { tag: 'BUTTON', text: 'Task a1', underline: 'underline' })
  // Session and Info stay on the row.
  assert.ok(await page.evaluate(`Boolean(document.querySelector('a[aria-label="Session: the worker chat for Task a1"]') && document.querySelector('button[aria-label="Details for Task a1"]'))`))
  await page.evaluate(`(() => { const b = document.querySelector('[data-task-title="a1"]'); b.focus(); b.click(); return true })()`)
  await page.until(`Boolean(document.querySelector('[role="dialog"][aria-labelledby="avoozl-drawer-title"]'))`)
  await settle()
  // Back (Alt+Left) is the drawer's step: it closes, focus goes back to the title.
  await page.evaluate(`(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true, bubbles: true }))`)
  await page.until(`!document.querySelector('[role="dialog"][aria-labelledby="avoozl-drawer-title"]')`)
  assert.equal(await page.evaluate(`document.activeElement?.dataset?.taskTitle ?? null`), 'a1')
})

test('In flight rows line up: titles, and Details, start at the same x in every row', { skip }, async () => {
  for (const width of [1280, 768]) {
    await page.open(harness.url({ modal: 'in-flight-pair' }), { width, height: 800 })
    await page.until(`document.querySelectorAll('[data-in-flight-row]').length === 2`)
    const cols = await page.evaluate(`(() => {
      const rows = [...document.querySelectorAll('[data-in-flight-row]')]
      const x = (el) => Math.round(el.getBoundingClientRect().left)
      return {
        role: rows.map((r) => x(r.querySelector('[data-in-flight-role]'))),
        title: rows.map((r) => x(r.querySelector('[data-task-title]'))),
        actions: rows.map((r) => x(r.querySelector('[data-in-flight-actions]'))),
        right: rows.map((r) => Math.round(r.querySelector('[data-in-flight-actions]').getBoundingClientRect().right)),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })()`)
    for (const key of ['role', 'title', 'actions', 'right']) assert.equal(cols[key][0], cols[key][1], `${key} lines up at ${width}px`)
    assert.equal(cols.sideways, false, `no sideways scroll at ${width}px`)
  }
})

const startDemo = `Boolean([...document.querySelectorAll('[data-demo-start]')].find((b) => b.textContent.trim() === 'Start demo'))`

test('Start demo shows in the empty In flight box only while nothing has ever run', { skip }, async () => {
  await page.open(harness.url({ page: 'home' }), { width: 1280, height: 800 })
  await page.until(`document.body.textContent.includes('No crew or chat is working right now.')`)
  assert.equal(await page.evaluate(startDemo), true, 'empty and never run: shown')
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-start]')?.closest('[data-scroll]'))`), true, 'inside the In flight card')
  await page.open(harness.url({ page: 'home', ran: '1' }), { width: 1280, height: 800 })
  await page.until(`document.body.textContent.includes('No crew or chat is working right now.')`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-demo-start]').length`), 0, 'empty but has run: hidden')
})

test('the page header never has Start demo or Try the demo', { skip }, async () => {
  {
    await page.open(harness.url({ app: '1' }), { width: 1280, height: 800 })
    await page.until(`Boolean(document.querySelector('[data-header-actions] [data-more-button]'))`)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-header-actions] [data-demo-start]'))`), false)
    assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-header-actions] button')].some((b) => /demo/i.test(b.textContent))`), false)
  }
})

test('Keep activity sits at the right of the filters on one row, inside the filter box', { skip }, async () => {
  for (const width of [1280, 375]) {
    await page.open(harness.url({ page: 'activity' }), { width, height: 900 })
    await page.until(`Boolean(document.querySelector('[data-section="Keep activity"]')) && document.body.textContent.includes('Saved a setting 2')`)
    const keep = await page.evaluate(`(() => {
      const section = document.querySelector('[data-section="Keep activity"]')
      const panel = document.querySelector('[data-filter-panel="avoozl-activity"]')
      const bar = panel.querySelector('[data-filter-bar]')
      const box = (el) => el.getBoundingClientRect()
      return {
        inPanel: panel.contains(section),
        // A narrow page folds the fields behind Filters, so no bar to compare.
        sameRow: bar ? Math.abs(box(section).bottom - box(bar).bottom) < 6 && box(section).left > box(bar).left : null,
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        inputInside: Boolean(section.querySelector('#avoozl-activity-keep')),
      }
    })()`)
    assert.equal(keep.inPanel, true, `Keep activity is in the filter box at ${width}px`)
    if (width >= 768) assert.equal(keep.sameRow, true, 'on the filters row')
    assert.equal(keep.inputInside, true, 'its field is inside it')
    assert.equal(keep.sideways, false, 'no sideways scroll')
  }
})

test("Stop the line from the More menu opens its dialog, and a tap or click in the dialog keeps it open", { skip }, async () => {
  await page.open(harness.url({ app: '1' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-header-actions] [data-more-button]'))`)
  await page.evaluate(`document.querySelector('[data-header-actions] [data-more-button]').click()`)
  await page.until(`Boolean(document.querySelector('[data-more-panel] [data-stop-line]'))`)
  await page.evaluate(`document.querySelector('[data-more-panel] [data-stop-line]').click()`)
  await page.until(`Boolean(document.querySelector('[data-stop-reason]'))`)
  await page.evaluate(`(() => {
    const input = document.querySelector('[data-stop-reason]')
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    input.click()
  })()`)
  await settle()
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-stop-reason]'))`), true, 'the dialog stays open')
})

// In a real Chrome (AVOOZL_CHROME, or an installed Chrome or Chromium), on
// the harness page (test/browser/harness.tsx): the top row with Switch
// model and Stop the line wraps without a sideways scroll at 375, 768 and
// 1280 px, light and dark, and shows a stopped line; an In flight title
// opens the task drawer as a Back step; and Switch model walks its three
// steps, showing the difference when the set changed. Skipped when no
// Chrome is found.
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
const button = (text) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`
const click = async (text) => {
  await page.until(`Boolean(${button(text)})`)
  await page.evaluate(`(() => { const b = ${button(text)}; b.focus(); b.click(); return true })()`)
  await settle()
}
// A controlled field's new value, the way React hears a person type.
const setValue = (selector, value) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    return true
  })()`)
const text = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`)

for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1280, 800],
])
  for (const dark of [false, true])
    test(`the header actions at ${width} px ${dark ? 'dark' : 'light'}: Switch model, then a red Stop the line, tabs alone below; no sideways scroll`, { skip }, async () => {
      for (const stopped of [false, true]) {
        await page.open(harness.url({ app: '1', theme: dark ? 'dark' : 'light', ...(stopped ? { stopped: '1' } : {}) }), { width, height, dark })
        await page.until(`Boolean(document.querySelector('[data-top-actions] [data-stop-line]'))`)
        if (stopped) await page.until(`Boolean(document.querySelector('[data-stop-line][data-stopped]'))`)
        await settle()
        const row = await page.evaluate(`(() => {
          const actions = document.querySelector('[data-top-actions]')
          const buttons = [...actions.querySelectorAll('button')].map((b) => b.textContent.trim())
          const box = (el) => el.getBoundingClientRect()
          const pane = document.querySelector('[data-host-pane]')
          const inside = [...document.querySelectorAll('[data-top-actions] button, [data-top-row] button')].every((b) => box(b).right <= innerWidth + 0.5 && box(b).left >= -0.5)
          const stop = actions.querySelector('[data-stop-line]')
          return {
            buttons,
            inside,
            sideways: Math.max(document.scrollingElement.scrollWidth, pane.scrollWidth) > innerWidth,
            stopLast: actions.lastElementChild.contains(stop),
            // The theme's danger color, as the browser resolves it.
            red: (() => {
              const probe = document.createElement('span')
              probe.style.color = 'var(--danger)'
              stop.parentElement.append(probe)
              const danger = getComputedStyle(probe).color
              probe.remove()
              return getComputedStyle(stop)[stop.dataset.stopped !== undefined ? 'borderTopColor' : 'backgroundColor'] === danger
            })(),
            label: stop.textContent.trim(),
            copies: document.querySelectorAll('[data-stop-line]').length,
          }
        })()`)
        assert.deepEqual(row.buttons, ['Switch model', stopped ? 'Line stopped' : 'Stop the line'])
        assert.equal(row.stopLast, true, 'Stop the line is last')
        assert.equal(row.copies, 1, 'one Stop the line on the page')
        assert.equal(row.inside, true, 'every top row button is on screen')
        assert.equal(row.sideways, false, 'no sideways scroll')
        assert.equal(row.red, true, stopped ? 'a red frame while stopped' : 'red')
        if (shots) {
          fs.mkdirSync(shots, { recursive: true })
          await page.screenshot(path.join(shots, `top-row-${width}-${dark ? 'dark' : 'light'}${stopped ? '-stopped' : ''}.png`))
        }
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
  // Attach and Info stay on the row.
  assert.ok(await page.evaluate(`Boolean(document.querySelector('a[aria-label="Attach to the worker chat for Task a1"]') && document.querySelector('button[aria-label="Details for Task a1"]'))`))
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

async function chooseAndDryRun() {
  await click('Switch model')
  await page.until(`Boolean(document.querySelector('[data-switch-intro]') && document.querySelector('select[data-switch-from]') && document.querySelector('#avoozl-switch-to'))`)
  // From: a dropdown of what is in use, health marks included.
  const options = await page.evaluate(`[...document.querySelectorAll('select[data-switch-from] option')].map((o) => o.value)`)
  assert.deepEqual(options, ['', 'alpha', 'beta'])
  await setValue('select[data-switch-from]', 'alpha')
  // To: the shared picker, auto first, then Kiro Crew's list.
  await page.evaluate(`document.querySelector('#avoozl-switch-to').focus()`)
  await setValue('#avoozl-switch-to', 'gam')
  await page.until(`[...document.querySelectorAll('#avoozl-switch-to-list [role="option"]')].length === 1`)
  await page.evaluate(`document.querySelector('#avoozl-switch-to-list [role="option"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  await settle()
  await page.evaluate(`document.querySelector('[data-switch-also-new]').click()`)
  await click('Dry run')
  await page.until(`document.querySelector('[data-switch-step]')?.dataset.switchStep === 'review'`)
}

test('Switch model: dropdowns, a dry run that lists who switches and who cannot, Back, then Confirm', { skip }, async () => {
  await page.open(harness.url({ modal: 'switch-flow' }), { width: 1280, height: 800 })
  await chooseAndDryRun()
  assert.match(await text('[data-switch-counts]'), /1 chat switch · 1 can't · 1 queued task affected/)
  const preview = await text('[data-switch-preview]')
  assert.match(preview, /Task a1/)
  assert.match(preview, /runs on remote crew remote-1/)
  assert.match(preview, /Routing skips provider alpha and uses gamma-1/)
  assert.match(preview, /Task q1/)
  const sent = await page.evaluate('window.__harness.dryRuns.at(-1)')
  assert.deepEqual(sent, { from: { provider: 'alpha' }, to: 'gamma-1', alsoNewTasks: true })
  assert.equal(await page.evaluate('window.__harness.switches.length'), 0, 'the dry run switches nothing')
  // Back keeps the choice.
  await click('Back')
  assert.equal(await page.evaluate(`document.querySelector('select[data-switch-from]').value`), 'alpha')
  await click('Dry run')
  await page.until(`document.querySelector('[data-switch-step]')?.dataset.switchStep === 'review'`)
  await click('Confirm')
  await page.until(`document.querySelector('[data-switch-step]')?.dataset.switchStep === 'done'`)
  assert.match(await text('[data-switch-done]'), /Queued 1 running chat to gamma-1\. Each moves at its next turn\. New tasks skip provider alpha/)
  assert.equal(await page.evaluate('window.__harness.switches.at(-1).previewHash'), 'h2')
})

test('Switch model: when the set changed since the dry run, it shows the difference and asks again', { skip }, async () => {
  await page.open(harness.url({ modal: 'switch-flow', changed: '1' }), { width: 1280, height: 800 })
  await chooseAndDryRun()
  await click('Confirm')
  await page.until(`Boolean(document.querySelector('[data-switch-changed]'))`)
  assert.match(await text('[data-switch-changed]'), /Added: Task a3/)
  assert.equal(await page.evaluate('window.__harness.switches.length'), 0, 'the changed set was not switched')
  await click('Confirm again')
  await page.until(`document.querySelector('[data-switch-step]')?.dataset.switchStep === 'done'`)
  assert.equal(await page.evaluate('window.__harness.switches.at(-1).previewHash'), 'h2')
})

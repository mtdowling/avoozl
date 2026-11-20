// In a real Chrome, on the harness's full app shell (?page=app&delivery=1):
// the Dashboards › Delivery heading holds Start now with its box, an
// icon-only Refresh and the Stop the line icon on one row, and Stop the line
// there stops and resumes the line. Skipped when no Chrome is found.
// AVOOZL_SHOTS=<dir> keeps a screenshot of each size and theme.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Delivery heading tests'
const shots = process.env.AVOOZL_SHOTS || null

let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const settle = () => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
const ACTIONS = '[data-heading-actions]'

// Open the app, then Dashboards › Delivery from the nav (the menu on a phone).
async function openDelivery(width, height, dark, extra = {}) {
  await page.open(harness.url({ page: 'app', delivery: '1', theme: dark ? 'dark' : 'light', ...extra }), { width, height, dark })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width < 768) {
    await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    await page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
  }
  await page.evaluate(
    `(() => { const h = document.querySelector('${scope} [data-nav-head][data-nav-group="dashboard"]'); if (h && !h.hasAttribute('data-open')) h.click(); return true })()`,
  )
  await page.until(`Boolean(document.querySelector('${scope} [data-nav-item="dashboard/delivery"]'))`)
  await page.evaluate(`document.querySelector('${scope} [data-nav-item="dashboard/delivery"]').click()`)
  await page.until(
    `Boolean(document.querySelector('#avoozl-delivery-title') && document.querySelector('[data-start-now-picker] input') && document.querySelector('${ACTIONS} [data-stop-line]'))`,
  )
  await settle()
}

for (const [width, height] of [
  [390, 844],
  [1280, 800],
])
  for (const dark of [false, true])
    test(`Delivery at ${width} px ${dark ? 'dark' : 'light'}: Start now, an icon-only Refresh and Stop the line share one row`, { skip }, async () => {
      await openDelivery(width, height, dark)
      const got = await page.evaluate(`(() => {
        const actions = document.querySelector('${ACTIONS}')
        const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 }
        const refresh = actions.querySelector('[data-delivery-refresh]'), stop = actions.querySelector('[data-stop-line]')
        const label = actions.querySelector('[data-start-now-picker] label'), input = actions.querySelector('[data-start-now-picker] input')
        const mids = [label, input, refresh, stop].map(mid)
        return {
          refresh: { label: refresh.getAttribute('aria-label'), text: refresh.textContent.trim(), icon: Boolean(refresh.querySelector('svg')) },
          stop: { label: stop.getAttribute('aria-label'), text: stop.textContent.trim() },
          label: label.textContent.trim(),
          spread: Math.max(...mids) - Math.min(...mids),
          order: label.getBoundingClientRect().right <= input.getBoundingClientRect().left && input.getBoundingClientRect().right <= refresh.getBoundingClientRect().left && refresh.getBoundingClientRect().right <= stop.getBoundingClientRect().left,
          // The tooltip's own text is hidden until hover; nothing else may read Refresh.
          refreshText: [...actions.querySelectorAll('*')].some((el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return el.children.length === 0 && el.textContent.trim() === 'Refresh' && r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[role="tooltip"], .sr-only') }),
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }
      })()`)
      assert.deepEqual(got.refresh, { label: 'Refresh', text: '', icon: true }, 'Refresh is an icon with a name')
      assert.equal(got.refreshText, false, 'no visible Refresh word')
      assert.deepEqual(got.stop, { label: 'Stop the line', text: '' }, 'Stop the line is an icon')
      assert.equal(got.label, 'Start now')
      assert.ok(got.spread < 2, `one row, centered: ${JSON.stringify(got)}`)
      assert.equal(got.order, true, 'Start now, its box, Refresh, then Stop the line')
      assert.equal(got.sideways, false, 'no sideways scroll')
      if (shots) {
        fs.mkdirSync(shots, { recursive: true })
        await page.screenshot(path.join(shots, `delivery-${width}-${dark ? 'dark' : 'light'}.png`))
      }
    })

test('Stop the line on Delivery stops the line after the dialog, and the play icon resumes it after asking', { skip }, async () => {
  await openDelivery(1280, 800, false)
  await page.evaluate(`document.querySelector('${ACTIONS} [data-stop-line]').click()`)
  await page.until(`Boolean(document.querySelector('[data-stop-reason]'))`)
  // A tap in the dialog keeps it open.
  await page.evaluate(`(() => {
    const input = document.querySelector('[data-stop-reason]')
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    input.click()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'bad base')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await settle()
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-stop-reason]'))`), true, 'the dialog stays open')
  assert.deepEqual(await page.evaluate(`window.__lineCalls`), [], 'nothing is written before the red button')
  await page.evaluate(`document.querySelector('[data-stop-confirm]').click()`)
  await page.until(`Boolean(document.querySelector('${ACTIONS} [data-stop-line][data-stopped]'))`)
  assert.deepEqual(await page.evaluate(`window.__lineCalls`), [{ stop: { scope: 'all', reason: 'bad base' } }])
  assert.equal(await page.evaluate(`document.querySelector('${ACTIONS} [data-stop-line]').getAttribute('aria-label')`), 'Resume the line')
  // The banner shows on Delivery too.
  await page.until(`Boolean(document.querySelector('[data-shell-line-banner] [data-line-banner]'))`)
  if (shots) await page.screenshot(path.join(shots, 'delivery-1280-light-stopped.png'))
  await page.evaluate(`document.querySelector('${ACTIONS} [data-stop-line]').click()`)
  const resume = `[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Resume')`
  await page.until(`Boolean(${resume})`)
  assert.equal((await page.evaluate(`window.__lineCalls`)).length, 1, 'Resume asks first')
  await page.evaluate(`${resume}.click()`)
  await page.until(`Boolean(document.querySelector('${ACTIONS} [data-stop-line]:not([data-stopped])')) && !document.querySelector('[data-shell-line-banner]')`)
  assert.deepEqual(await page.evaluate(`window.__lineCalls`), [{ stop: { scope: 'all', reason: 'bad base' } }, { resume: 'l1' }])
  assert.deepEqual(page.errors, [])
})

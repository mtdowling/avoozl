// In flight titles are real links that open the task's drawer. In a real
// Chrome (AVOOZL_CHROME, or an installed Chrome or Chromium), the harness
// page renders the real Dashboard and Delivery with a2 and b1 running.
// Clicking a title, or Enter on it, opens that task's drawer; Back (Alt+Left,
// the app's own Back history) closes it. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

// Runs without Chrome: every running-task list draws its title with the one
// shared link, and keeps Info and Attach.
test('In flight and Delivery titles use the shared task link and keep Info and Attach', () => {
  const dashboard = source('DashboardView.tsx'),
    delivery = source('DeliveryView.tsx')
  assert.match(dashboard, /<TaskTitleLink id=\{row\.taskId\}/)
  assert.match(dashboard, /label=\{`Details for \$\{row\.title\}`\}/)
  assert.match(dashboard, /Attach\n/)
  assert.match(delivery, /<TaskTitleLink id=\{card\.id\}/)
  assert.match(source('controls.tsx'), /export function TaskTitleLink[\s\S]*?<a\s+href=/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the In flight link tests'
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

const LINK = (id) => `document.querySelector('a[data-task-link="${id}"]')`
const DRAWER_TITLE = `(document.getElementById('avoozl-drawer-title')?.textContent ?? null)`

async function load(view) {
  await page.open(harness.url({ view }), { width: 1280, height: 800, dark: false })
  await page.until(`Boolean(${LINK('b1')}) && Boolean(${LINK('a2')})`)
}

for (const view of ['dashboard', 'delivery']) {
  test(`${view}: a running task's title opens its drawer, and Back closes it`, { skip }, async () => {
    await load(view)
    // A real link: an anchor with an href, in the keyboard's tab order.
    assert.deepEqual(await page.evaluate(`(() => { const a = ${LINK('b1')}; return { tag: a.tagName, href: Boolean(a.getAttribute('href')), tab: a.tabIndex } })()`), { tag: 'A', href: true, tab: 0 })

    // A mouse click on b1's title, where it is on screen.
    const [x, y] = await page.evaluate(`(() => { const a = ${LINK('b1')}; a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })()`)
    await page.click(x, y)
    assert.equal(await page.until(`${DRAWER_TITLE} === 'Task b1' && ${DRAWER_TITLE}`), 'Task b1')

    // Back closes it, and focus goes back to the title.
    await page.evaluate(`(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true })); return true })()`)
    await page.until(`!document.querySelector('[role="dialog"]')`)
    assert.equal(await page.evaluate(`document.activeElement === ${LINK('b1')}`), true, 'focus went back to the title')

    // Enter on a focused title opens that task, not another.
    await page.evaluate(`(() => { ${LINK('a2')}.focus(); return true })()`)
    await page.key('Enter', 'Enter', 13)
    assert.equal(await page.until(`${DRAWER_TITLE} === 'Task a2' && ${DRAWER_TITLE}`), 'Task a2')
    assert.deepEqual(page.errors, [], `${view}: page errors`)
  })
}

// Pages with a list and a detail follow Kiro Crew's list-detail pattern on a
// phone. In a real Chrome (AVOOZL_CHROME, or an installed Chrome or Chromium)
// on the harness page with the Demo mode sample, at 390 and 1280 px, light and
// dark: one pane shows at a time, the detail has a Back control in a sticky
// row, Back returns to the list, and a desktop is unchanged. Skipped when no
// Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the phone page tests'
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

const wait = (ms = 250) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const has = (selector) => page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
const click = (expression) => page.evaluate(`(() => { const el = ${expression}; el.click(); return true })()`)
const button = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`

async function start(width, dark) {
  await page.open(harness.url({ page: 'demo', theme: dark ? 'dark' : 'light' }), { width, height: 800, dark })
  await page.until(`Boolean(${button('Start demo')})`)
  await click(button('Start demo'))
  await page.until(`Boolean(document.querySelector('[data-demo-tour]'))`)
  await wait(500)
}
// A phone picks a page in the top rail; a desktop clicks its tab.
async function goto(name, width) {
  if (width < 768) {
    await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    await wait(100)
    await click(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes(${JSON.stringify(name)}))`)
    // Specs opens to its filters in the menu and keeps it open; close it.
    await wait(100)
    if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list] [data-nav-section][data-open] [data-nav-slot]') && !document.querySelector('[data-top-rail-list] [data-nav-section][data-open] [data-nav-children] > [data-nav-item]'))`))
      await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  } else await click(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes(${JSON.stringify(name)}))`)
  await wait(500)
}
// A section of the nav opens to its pages; on a phone the menu may need opening first.
async function pickPage(selector, width) {
  if (width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) {
    await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    await wait(200)
  }
  await click(`document.querySelector(${JSON.stringify(selector)})`)
  await wait(400)
}
const back = () => click(`document.querySelector('[data-list-detail-back]')`).then(() => wait())

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'

  test(`Settings on a phone: the menu lists the sections, the page shows only the picked one (${theme})`, { skip }, async () => {
    await start(390, dark)
    await goto('Settings', 390)
    assert.equal(await has('[data-nav-children="settings"]'), true, 'the menu opens the Settings sections')
    await pickPage('[data-nav-item="settings/repositories"]', 390)
    assert.equal(await has('[data-top-rail-list]'), false, 'picking a section closes the menu')
    assert.equal(await has('[data-settings-body="repositories"]'), true, 'the section shows')
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-settings-section]').length`), 1, 'only the picked section')
    assert.equal(await has('[data-detail-bar]'), false)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, 'no sideways scroll')
  })

  test(`Needs you on a phone: the decision list, one item with Back, then the other tab (${theme})`, { skip }, async () => {
    await start(390, dark)
    await goto('Needs you', 390)
    await pickPage('[data-nav-item="waiting/decisions"]', 390)
    assert.equal(await has('[data-waiting-section="decisions"][data-open="true"]'), true, 'opens on decisions')
    assert.equal(await has('[data-conflict-list]'), true, 'the list first')
    assert.equal(await has('[data-detail-bar]'), false)
    await click(`document.querySelector('[data-conflict-pick]')`)
    await wait()
    assert.equal(await has('[data-conflict-detail]'), true, 'the item opens')
    assert.equal(await has('[data-conflict-list]'), false, 'one pane at a time')
    assert.equal(await has('[data-detail-bar]'), true)
    await back()
    assert.equal(await has('[data-conflict-list]'), true, 'Back returns to the list')
    await pickPage('[data-nav-item="waiting/intake"]', 390)
    assert.equal(await has('[data-waiting-section="intake"][data-open="true"]'), true)
  })

  test(`Specs on a phone: the list, then one spec whose Back shares a row with the compact title (${theme})`, { skip }, async () => {
    await start(390, dark)
    await goto('Specs', 390)
    assert.equal(await has('[data-plans-list]'), true)
    assert.equal(await has('[data-detail-bar]'), false)
    await click(button('Meal planner', `document.querySelector('[data-plans-list]')`))
    await wait(600)
    assert.equal(await has('[data-plans-list]'), false, 'the list is out of the way')
    assert.equal(await has('[data-detail-bar]'), true)
    assert.match(await page.evaluate(`document.querySelector('[data-detail-bar]').textContent`), /All specs/)
    const echo = () => page.evaluate(`getComputedStyle(document.querySelector('[data-detail-echo]')).opacity`)
    assert.equal(await echo(), '0', 'the title shows once, big, at the top')
    // The page's content pane scrolls; the Back row stays at its top.
    const pane = `document.querySelector('[data-avoozl-pane]')`
    assert.ok(await page.evaluate(`${pane}.scrollHeight > ${pane}.clientHeight + 150`), 'the spec is long enough to scroll')
    const gap = `Math.abs(document.querySelector('[data-detail-bar]').getBoundingClientRect().top - ${pane}.getBoundingClientRect().top)`
    await page.evaluate(`${pane}.scrollTop = ${pane}.scrollHeight`)
    await wait(400)
    assert.ok((await page.evaluate(gap)) <= 1, 'the row sticks to the top of the pane')
    assert.equal(await echo(), '1', 'the compact title shows once the big one has scrolled out')
    // The rail stacks under the cards; the header's title is the one big title.
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-detail-title], #avoozl-plan-title').length`), 1, 'one big title')
    const order = await page.evaluate(`(() => { const main = document.querySelector('#avoozl-plan-main').getBoundingClientRect(), rail = document.querySelector('[data-spec-rail]').getBoundingClientRect(); return { below: rail.top >= main.bottom - 1, wide: Math.round(rail.width) >= Math.round(main.width) - 1 } })()`)
    assert.deepEqual(order, { below: true, wide: true }, 'the rail is under the main column, as wide')
    assert.equal(await has('[data-spec-menu]'), false, 'no spec hamburger')
    await back()
    assert.equal(await has('[data-plans-list]'), true, 'Back returns to the list')
  })

  test(`a desktop at 1280 px is unchanged: no detail bar, Settings shows one section, Specs list beside its detail (${theme})`, { skip }, async () => {
    await start(1280, dark)
    await goto('Settings', 1280)
    assert.equal(await has('[data-settings-body]'), true, 'the open section sits under its heading')
    assert.equal(await has('[data-detail-bar]'), false)
    await goto('Needs you', 1280)
    // A dense list in the middle; picking an item opens it on the right.
    assert.equal(await has('[data-conflict-list]'), true)
    await click(`document.querySelector('[data-conflict-pick]')`)
    await wait()
    assert.equal(await has('[data-detail-column="needs-you"] [data-conflict-detail]'), true)
    assert.equal(await has('[data-list-pane="needs-you"] [data-conflict-list]'), true, 'the list stays')
    await goto('Specs', 1280)
    await click(button('Meal planner', `document.querySelector('[data-plans-list]')`))
    await wait(600)
    assert.equal(await has('[data-detail-bar]'), false)
    assert.equal(await has('[data-list-detail-back]'), false)
    // The list stays on the left, the spec opens on the right.
    assert.equal(await has('[data-list-pane="specs"] [data-spec-list]'), true)
    assert.equal(await has('[data-detail-column="specs"] [data-spec-detail]'), true)
    // New task is in the spec's ... menu, not on the list (RC30.2).
    await click(`document.querySelector('[data-detail-column="specs"] [data-spec-more] [data-more-button]')`)
    await wait(200)
    assert.equal(await has('[data-detail-column="specs"] [data-new-task]'), true)
    assert.equal(await has('[data-list-pane="specs"] [data-new-task]'), false)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  })
}

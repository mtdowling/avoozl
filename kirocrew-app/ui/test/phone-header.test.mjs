// The page's phone chrome, after Kiro Crew's phone layout. In a real Chrome
// (AVOOZL_CHROME, or an installed Chrome or Chromium) on the Demo sample, at
// 390 and 1280 px, light and dark: a phone has one thin header row, a one-line
// demo bar, and headings whose many buttons sit in a More menu; a desktop keeps
// its header, bar and buttons. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the phone header tests'
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
const height = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().height ?? null`)
const start = async (width, dark) => {
  await page.open(harness.url({ page: 'demo', theme: dark ? 'dark' : 'light' }), { width, height: 844, dark })
  const startButton = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start demo')`
  await page.until(`Boolean(${startButton})`)
  await page.evaluate(`${startButton}.click()`)
  await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
  await wait(500)
}
const toSpecs = async (phone) => {
  if (phone) {
    await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    await wait(100)
    await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
  } else await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
  await page.until(`Boolean(document.querySelector('#avoozl-plans-title'))`)
  await wait(400)
}

for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'
  test(`a phone at 390 px: one menu row, a demo bar with the intro, Specs buttons in More (${theme})`, { skip }, async () => {
    await start(390, dark)
    assert.ok((await height('[data-phone-header]')) <= 56, 'one header row')
    assert.match(await page.evaluate(`document.querySelector('[data-demo-intro]').textContent`), /Avoozl turns your specs and epics into a graph/, 'the demo bar says what Avoozl is')
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-bar] [data-demo-badge]'))`), true, 'the bar has the Demo badge')
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-bar] [data-demo-exit]'))`), true, 'Exit demo is one tap')
    // The demo's own controls are in the bar, since there is no header menu.
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-demo-bar] [data-demo-stop-example]').length`), 2)

    await toSpecs(true)
    const heading = `document.querySelector('#avoozl-plans-title').closest('[data-section-heading]')`
    // The title and the More button share one row: their middles line up.
    const middles = await page.evaluate(`(() => { const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 }; return [mid(document.querySelector('#avoozl-plans-title')), mid(${heading}.querySelector('[data-more-button]'))] })()`)
    assert.ok(Math.abs(middles[0] - middles[1]) <= 8, `the Specs heading is one row (${middles})`)
    assert.equal(await page.evaluate(`Boolean(${heading}.querySelector('[data-heading-more]'))`), true, 'its buttons are in More')
    await page.evaluate(`${heading}.querySelector('[data-more-button]').click()`)
    await wait()
    const items = await page.evaluate(`[...${heading}.querySelectorAll('[data-more-panel] button')].map((b) => b.textContent.trim())`)
    assert.ok(items.includes('New spec') && !items.includes('New task'), `More holds the buttons (${items})`)
    const wide = await page.evaluate(`[...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map((el) => el.tagName + '.' + String(el.className).slice(0, 40) + ':' + el.textContent.slice(0, 30))`)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `no sideways scroll (${wide})`)
  })

  test(`a desktop at 1280 px keeps its header, bar and heading buttons (${theme})`, { skip }, async () => {
    await start(1280, dark)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-phone-header]'))`), false)
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-demo-bar] [data-demo-stop-example]').length`), 2)
    await toSpecs(false)
    const heading = `document.querySelector('#avoozl-plans-title').closest('[data-section-heading]')`
    assert.equal(await page.evaluate(`Boolean(${heading}.querySelector('[data-heading-more]'))`), false)
    assert.ok(await page.evaluate(`[...${heading}.querySelectorAll('[data-heading-actions] button')].some((b) => b.textContent.trim() === 'New spec')`))
  })
}

// Home: Release queue and Progress by epic sit side by side on a desktop and
// stack on a phone.
const pairBoxes = () =>
  page.evaluate(`(() => {
    const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), height: Math.round(r.height) } }
    return { queue: box('[data-release-queue]'), progress: box('[data-progress-by-epic]') }
  })()`)
for (const dark of [false, true])
  for (const width of [390, 1280]) {
    const theme = dark ? 'dark' : 'light'
    test(`Home at ${width} px (${theme}): Release queue and Progress by epic ${width < 768 ? 'stack' : 'share one row'}`, { skip }, async () => {
      await start(width, dark)
      await page.until(`Boolean(document.querySelector('[data-release-queue]') && document.querySelector('[data-progress-by-epic]'))`, 15000)
      await wait(300)
      const { queue, progress } = await pairBoxes()
      if (width < 768) assert.ok(progress.top >= queue.top + queue.height, `stacked (${JSON.stringify({ queue, progress })})`)
      else {
        assert.equal(progress.top, queue.top, 'same row')
        assert.ok(progress.left > queue.left, 'queue left, progress right')
        assert.equal(progress.height, queue.height, 'same height')
      }
    })
  }

// The nav is as tall as the window, as Issue Radar's is: its bottom edge is the
// window's bottom at 1280x800 and 390x844 (the phone's menu). The one open
// pill takes the height the closed ones leave, so the pills end where the
// brand row begins, and an open pill whose content is short shows its
// background down to its bottom edge. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the nav height test'
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
const wait = (ms = 250) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const scope = (width) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
const toggle = async (width, key) => {
  await page.evaluate(`document.querySelector('${scope(width)} [data-nav-group="${key}"]').click()`)
  await wait()
}

const MEASURE = (width) => `(() => {
  const nav = document.querySelector('${scope(width)}')
  const accordion = nav.querySelector('[data-nav-accordion]')
  const brand = nav.querySelector('[data-brand-card]')
  const open = [...nav.querySelectorAll('[data-nav-section][data-open]')].map((el) => {
    const r = el.getBoundingClientRect(), body = el.querySelector('[data-nav-children]')
    return { top: r.top, bottom: r.bottom, height: r.height, scrolls: body.scrollHeight > body.clientHeight + 1 }
  })
  const sections = [...nav.querySelectorAll('[data-nav-section]')].map((el) => el.getBoundingClientRect().bottom)
  return { navBottom: nav.getBoundingClientRect().bottom, view: innerHeight, accordionBottom: accordion.getBoundingClientRect().bottom, lastSection: Math.max(...sections), brandTop: brand.getBoundingClientRect().top, brandBottom: brand.getBoundingClientRect().bottom, open, scrollsNav: nav.scrollHeight > nav.clientHeight + 1 }
})()`

for (const [width, height] of [
  [1280, 800],
  [390, 844],
])
  for (const dark of [false, true])
    test(`at ${width}x${height} ${dark ? 'dark' : 'light'}: the nav reaches the window's bottom and the open pill fills the gap`, { skip }, async () => {
      await page.open(harness.url({ page: 'app', theme: dark ? 'dark' : 'light', needs: '12', specs: '1', activity: '1' }), { width, height, dark })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      if (width < 768) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
      }
      await wait()
      for (const key of [null, 'settings']) {
        if (key) await toggle(width, key)
        const m = await page.evaluate(MEASURE(width))
        const label = key ? 'Settings open' : 'Dashboards open'
        assert.equal(m.open.length, 1, `${label}: one pill open`)
        assert.ok(Math.abs(m.navBottom - m.view) <= 1, `${label}: the nav ends at ${m.navBottom}, the window at ${m.view}`)
        // Only the Collapse row, the line controls and 8px gaps sit between the pills and the brand.
        assert.ok(m.brandTop - m.lastSection <= (width < 768 ? 80 : 48), `${label}: pills end at ${m.lastSection}, brand starts at ${m.brandTop}`)
        assert.ok(m.brandBottom <= m.view + 1, `${label}: the brand row is inside the window`)
        assert.ok(Math.abs(m.accordionBottom - m.lastSection) <= 1, `${label}: the open pills run to the accordion's bottom`)
        if (!m.scrollsNav) for (const o of m.open) assert.ok(o.height >= 96, 'an open pill keeps its minimum height')
      }
      assert.deepEqual(page.errors, [])
    })

test('an open pill with little in it still fills its share, down to its bottom edge', { skip }, async () => {
  await page.open(harness.url({ page: 'app', theme: 'light' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-left-nav] [data-nav-section][data-open]'))`)
  await wait()
  const m = await page.evaluate(`(() => {
    const pill = document.querySelector('[data-left-nav] [data-nav-section][data-open]')
    const body = pill.querySelector('[data-nav-children]')
    const last = [...body.children].pop().getBoundingClientRect()
    return { pillBottom: pill.getBoundingClientRect().bottom, contentBottom: last.bottom, bodyBottom: body.getBoundingClientRect().bottom }
  })()`)
  assert.ok(m.pillBottom - m.contentBottom > 40, `empty space under the rows: ${m.pillBottom - m.contentBottom}px`)
  assert.ok(Math.abs(m.bodyBottom - m.pillBottom) <= 12, 'the body runs to the pill bottom')
})

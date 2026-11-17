// In a real Chrome (AVOOZL_CHROME, or an installed Chrome or Chromium), on
// the harness page (test/browser/harness.tsx): the app shell (no top bars; the
// workspace pill first in the nav; Plan a goal first in the main column; Stop the line an
// icon in the nav) has no Switch model, no
// visible "Stop the line" text and no sideways scroll at 375, 768 and 1280 px,
// light and dark, running and stopped; an In flight title opens the task
// drawer as a Back step. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the top row tests'
// AVOOZL_SHOTS=<dir> keeps a screenshot of each top row size and theme.
const shots = process.env.AVOOZL_SHOTS || null

let harness, demoHarness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness()
  demoHarness = await buildHarness({ scripts: { 'demo.js': demoScript(await demoReplies()) } })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
  demoHarness?.remove()
})

const settle = () => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')

// The line controls: on a desktop in their own small section of the left nav,
// on a phone at the bottom of the menu. Open it when the page is a phone.
// Where Stop the line is: on a desktop the page's top line, right after Plan
// a goal; on a phone the bottom of the menu (open it first).
const LINE = (width) => (width < 768 ? '[data-nav-line]' : '[data-main-actions]')
const openLine = async (width) => {
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await page.until(`Boolean(document.querySelector('${LINE(width)} [data-stop-line]'))`)
  await settle()
}

for (const [width, height] of [
  [375, 740],
  [768, 1024],
  [1280, 800],
])
  for (const dark of [false, true])
    test(`the shell at ${width} px ${dark ? 'dark' : 'light'}: no top bars, Stop the line an icon (top line on a desktop, menu on a phone), no visible Stop the line text; no sideways scroll`, { skip }, async () => {
      for (const stopped of [false, true]) {
        await page.open(harness.url({ app: '1', theme: dark ? 'dark' : 'light', ...(stopped ? { stopped: '1' } : {}) }), { width, height, dark })
        await page.until(`Boolean(document.querySelector('[data-main-top]') && document.querySelector('[data-workspace-pill]:not([disabled])') || (${width} < 768 && document.querySelector('[data-top-rail-bar]')))`)
        await settle()
        const closed = await page.evaluate(`(() => {
          const pane = document.querySelector('[data-host-pane]')
          const main = document.querySelector('[data-shell-main]')
          return {
            switchModel: [...document.querySelectorAll('button')].some((b) => /Switch model/.test(b.textContent)) || Boolean(document.querySelector('[data-switch-model]')),
            moreButtons: document.querySelectorAll('[data-header-more], [data-header-actions]').length,
            logoBar: Boolean(document.querySelector('[data-header-brand]')),
            // The workspace is the pill at the top of the nav, never in the main column.
            selectorFirst: main.firstElementChild.matches('[data-main-top]') && !main.querySelector('[data-workspace-pill], select[aria-label="Workspace"]') && (${width} < 768 || document.querySelector('[data-left-nav] [data-workspace-pill], [data-left-nav] [data-nav-section]')?.matches('[data-workspace-pill]')),
            sideways: Math.max(document.scrollingElement.scrollWidth, pane.scrollWidth) > innerWidth,
          }
        })()`)
        assert.equal(closed.switchModel, false, 'no Switch model anywhere')
        assert.equal(closed.moreButtons, 0, 'no header or ... menu')
        assert.equal(closed.logoBar, false, 'no logo bar')
        assert.equal(closed.selectorFirst, true, 'the workspace pill starts the nav, not the main column')
        assert.equal(closed.sideways, false, 'no sideways scroll')
        if (width < 768) {
          const header = await page.evaluate(`document.querySelector('[data-phone-header]').getBoundingClientRect().height`)
          assert.ok(header <= 56, `the phone header is one row (${header})`)
        }
        await openLine(width)
        if (stopped) await page.until(`Boolean(document.querySelector('${LINE(width)} [data-stop-line][data-stopped]'))`)
        const open = await page.evaluate(`(() => {
          const stop = document.querySelector('${LINE(width)} [data-stop-line]')
          const plan = [...document.querySelectorAll('[data-main-actions] button')].find((b) => b.textContent.trim() === 'Plan a goal')
          const r = stop.getBoundingClientRect()
          const visible = []
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement
            const box = el.getBoundingClientRect(), style = getComputedStyle(el)
            if (box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && !el.closest('.sr-only')) visible.push(n.nodeValue.trim())
          }
          const p = plan ? plan.getBoundingClientRect() : null
          return { label: stop.getAttribute('aria-label'), text: stop.textContent.trim(), size: [Math.round(r.width), Math.round(r.height)], matchesPlan: p ? Math.abs(p.height - r.height) < 1 && r.left >= p.right && Math.abs(p.top - r.top) < 1 : null, inNav: Boolean(stop.closest('[data-left-nav]')), onScreen: r.left >= 0 && r.right <= innerWidth, texts: visible.filter((t) => /stop the line|resume the line/i.test(t)) }
        })()`)
        assert.match(open.label, stopped ? /Resume the line/ : /Stop the line/)
        assert.equal(open.text, '', 'the icon has no words')
        if (width < 768) assert.deepEqual(open.size, [28, 28], 'a compact 28 px icon')
        else {
          assert.equal(open.matchesPlan, true, 'as tall as Plan a goal, right after it')
          assert.equal(open.size[0], open.size[1], 'square')
          assert.equal(open.inNav, false, 'not in the left nav')
        }
        assert.equal(open.onScreen, true, 'it is on screen')
        assert.deepEqual(open.texts, [], 'no visible text reads Stop the line')
        if (shots) {
          fs.mkdirSync(shots, { recursive: true })
          await page.screenshot(path.join(shots, `top-row-${width}-${dark ? 'dark' : 'light'}${stopped ? '-stopped' : ''}.png`))
        }
      }
    })

// The same no-visible-text rule in Demo mode, demo bar included: its Stop
// the line example is an icon whose words are only its tooltip and name. The
// workspace pill still starts the nav, naming the sample.
const VISIBLE_STOP = `(() => {
  const out = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement, box = el.getBoundingClientRect(), style = getComputedStyle(el)
    if (box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && !el.closest('.sr-only') && /stop the line|resume the line/i.test(n.nodeValue)) out.push(n.nodeValue.trim())
  }
  return out
})()`
for (const [width, height] of [
  [390, 844],
  [1280, 800],
])
  for (const dark of [false, true])
    test(`Demo mode at ${width} px ${dark ? 'dark' : 'light'}: no visible Stop the line text, the demo bar's example is an icon, the workspace pill starts the nav`, { skip }, async () => {
      await page.open(demoHarness.url({ page: 'demo', theme: dark ? 'dark' : 'light' }), { width, height, dark })
      const start = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start demo')`
      await page.until(`Boolean(${start})`)
      await page.evaluate(`${start}.click()`)
      await page.until(`Boolean(document.querySelector('[data-demo-bar] [data-demo-stop-example]'))`)
      for (const example of ['running', 'stopped']) {
        const got = await page.evaluate(`(() => {
          const b = document.querySelector('[data-demo-bar] [data-demo-stop-example]')
          return { example: b.dataset.demoStopExample, text: b.textContent.trim(), label: b.getAttribute('aria-label'), icon: Boolean(b.querySelector('svg')), bar: document.querySelector('[data-demo-bar]').textContent }
        })()`)
        assert.equal(got.example, example)
        assert.equal(got.text, '', 'the example has no words')
        assert.equal(got.icon, true, 'it is an icon')
        assert.match(got.label, /^Stop the line example: /)
        assert.doesNotMatch(got.bar, /Issue Radar/, 'the demo bar names no Radar')
        assert.match(got.bar, /Avoozl’s workers code the ready ones/)
        assert.deepEqual(await page.evaluate(VISIBLE_STOP), [], `no visible Stop the line text (${example})`)
        await page.evaluate(`document.querySelector('[data-demo-bar] [data-demo-stop-example]').click()`)
        await settle()
      }
      if (width < 768) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
        assert.deepEqual(await page.evaluate(VISIBLE_STOP), [], 'no visible Stop the line text in the menu')
      }
      const nav = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
      const pill = await page.evaluate(`(() => { const first = document.querySelector('${nav} [data-workspace-pill], ${nav} [data-nav-section]'); return { first: Boolean(first?.matches('[data-workspace-pill]')), text: first?.textContent ?? '' } })()`)
      assert.equal(pill.first, true, 'the workspace pill starts the nav in the demo')
      assert.match(pill.text, /Demo: Recipe Box/)
      assert.deepEqual(page.errors, [])
    })

test('the brand line sits under the nav: one line, no box, the logo left and the name and version right', { skip }, async () => {
  await page.open(harness.url({ app: '1' }), { width: 1280, height: 800 })
  await page.until(`Boolean(document.querySelector('[data-brand-card] [data-instance-name]'))`)
  const got = await page.evaluate(`(() => {
    const nav = document.querySelector('[data-nav-card]'), brand = document.querySelector('[data-brand-card]'), main = document.querySelector('[data-shell-main]')
    const box = (el) => el.getBoundingClientRect()
    const logo = brand.querySelector('svg'), name = brand.querySelector('[data-instance-name]'), version = brand.querySelector('[data-avoozl-version]')
    const mid = (el) => { const r = box(el); return r.top + r.height / 2 }
    const cs = getComputedStyle(brand)
    return {
      oneLine: Math.abs(mid(logo) - mid(name)) < 4 && Math.abs(mid(name) - mid(version)) < 4,
      order: box(logo).right <= box(name).left && box(name).right <= box(version).left,
      logoLeft: box(logo).left - box(brand).left < 12,
      versionRight: box(brand).right - box(version).right < 8,
      noBox: cs.borderTopWidth === '0px' && (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent'),
      apart: !nav.contains(brand), below: box(brand).top >= box(nav).bottom, leftOfMain: box(brand).right <= box(main).left + 1, version: brand.querySelector('[data-avoozl-version]')?.textContent, tagline: document.body.textContent.includes('Specs and epics as a graph') }
  })()`)
  assert.equal(got.oneLine, true, 'one line')
  assert.equal(got.order, true, 'logo, name, version')
  assert.equal(got.logoLeft, true, 'the logo at the left')
  assert.equal(got.versionRight, true, 'the name and version at the right')
  assert.equal(got.noBox, true, 'no border, no background')
  assert.equal(got.apart, true, 'not inside the nav card')
  assert.equal(got.below, true)
  assert.equal(got.leftOfMain, true)
  assert.match(got.version, /^v\S+$/)
  assert.equal(got.tagline, false, 'no always-visible tag line')
  // A phone: the menu button, and the brand card at the bottom of the menu.
  await page.open(harness.url({ app: '1' }), { width: 390, height: 844 })
  await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-brand-card]'))`), false, 'closed menu: no brand card')
  await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await page.until(`Boolean(document.querySelector('[data-top-rail-footer] [data-brand-card]'))`)
  assert.equal(await page.evaluate(`(() => { const f = document.querySelector('[data-top-rail-footer]').getBoundingClientRect(), l = document.querySelector('[data-top-rail-list]').getBoundingClientRect(); return Math.abs(f.bottom - l.bottom) < 2 })()`), true, 'at the bottom of the menu')
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
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-demo-start]')?.closest('[data-home-section="in-flight"] [data-home-box]'))`), true, 'inside the In flight card')
  await page.open(harness.url({ page: 'home', ran: '1' }), { width: 1280, height: 800 })
  await page.until(`document.body.textContent.includes('No crew or chat is working right now.')`)
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-demo-start]').length`), 0, 'empty but has run: hidden')
})

test('the top of the main column never has Start demo or Try the demo', { skip }, async () => {
  {
    await page.open(harness.url({ app: '1' }), { width: 1280, height: 800 })
    await page.until(`Boolean(document.querySelector('[data-main-top]'))`)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-main-top] [data-demo-start]'))`), false)
    assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-main-top] button')].some((b) => /demo/i.test(b.textContent))`), false)
  }
})

test('Keep activity sits with the Activity filters in the nav, under the open Activity section', { skip }, async () => {
  for (const width of [1280, 375]) {
    await page.open(harness.url({ page: 'app', activity: '1' }), { width, height: 900 })
    const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
    if (width < 768) {
      await page.until(`Boolean(document.querySelector('[data-top-rail-bar]'))`)
      await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    }
    await page.until(`Boolean([...document.querySelectorAll('${scope} [data-nav-head]')].find((b) => b.textContent.includes('Activity')))`)
    await page.evaluate(`[...document.querySelectorAll('${scope} [data-nav-head]')].find((b) => b.textContent.includes('Activity')).click()`)
    await page.until(`Boolean(document.querySelector('${scope} [data-section="Keep activity"]'))`)
    const keep = await page.evaluate(`(() => {
      const section = document.querySelector('${scope} [data-section="Keep activity"]')
      const panel = document.querySelector('${scope} [data-nav-section="activity"] [data-filter-panel="avoozl-activity"]')
      return {
        inPanel: Boolean(panel && panel.contains(section)),
        notInPage: !document.querySelector('[data-avoozl-pane] [data-filter-panel="avoozl-activity"]'),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        inputInside: Boolean(section.querySelector('#avoozl-activity-keep')),
      }
    })()`)
    assert.equal(keep.inPanel, true, `Keep activity is with the nav's Activity filters at ${width}px`)
    assert.equal(keep.notInPage, true, 'the filters are not in the page')
    assert.equal(keep.inputInside, true, 'its field is inside it')
    assert.equal(keep.sideways, false, 'no sideways scroll')
  }
})

test('Activity rail: a source row and a kind chip filter the rows, and a second click clears the chip', { skip }, async () => {
  await page.open(harness.url({ page: 'app', activity: '1' }), { width: 1280, height: 900 })
  const scope = '[data-left-nav]'
  await page.until(`Boolean([...document.querySelectorAll('${scope} [data-nav-head]')].find((b) => b.textContent.includes('Activity')))`)
  await page.evaluate(`[...document.querySelectorAll('${scope} [data-nav-head]')].find((b) => b.textContent.includes('Activity')).click()`)
  await page.until(`document.querySelectorAll('[data-activity-row]').length === 24 && Boolean(document.querySelector('${scope} [data-rail-chip="settings"]'))`)
  await page.evaluate(`document.querySelector('${scope} [data-rail-source="github"]').click()`)
  await page.until(`document.querySelectorAll('[data-activity-row]').length === 6`)
  const chip = `document.querySelector('${scope} [data-rail-chip="settings"]')`
  await page.evaluate(`${chip}.click()`)
  await page.until(`document.querySelectorAll('[data-activity-row]').length === 2`)
  assert.equal(await page.evaluate(`${chip}.getAttribute('aria-pressed')`), 'true')
  assert.equal(await page.evaluate(`${chip}.getAttribute('aria-label')`), 'settings, 3', 'the chip names its count')
  await page.evaluate(`${chip}.click()`)
  await page.until(`document.querySelectorAll('[data-activity-row]').length === 6`)
  // Clear in the Source header drops every filter.
  await page.evaluate(`[...document.querySelectorAll('${scope} [data-rail-section="source"] [data-rail-icon]')].find((b) => b.textContent.includes('Clear')).click()`)
  await page.until(`document.querySelectorAll('[data-activity-row]').length === 24`)
  assert.equal(await page.evaluate(`document.querySelector('${scope} [data-rail-source=""]').getAttribute('aria-pressed')`), 'true')
})

test("Stop the line from the top line opens its dialog, and a tap or click in the dialog keeps it open", { skip }, async () => {
  await page.open(harness.url({ app: '1' }), { width: 1280, height: 800 })
  await openLine(1280)
  await page.evaluate(`document.querySelector('[data-main-actions] [data-stop-line]').click()`)
  await page.until(`Boolean(document.querySelector('[data-stop-reason]'))`)
  await page.evaluate(`(() => {
    const input = document.querySelector('[data-stop-reason]')
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    input.click()
  })()`)
  await settle()
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-stop-reason]'))`), true, 'the dialog stays open')
})

test('a hovered nav item changes color, the selected one stays different, and keyboard focus shows a ring', { skip }, async () => {
  for (const dark of [false, true]) {
    await page.open(harness.url({ app: '1', theme: dark ? 'dark' : 'light' }), { width: 1280, height: 800, dark })
    await page.until(`Boolean(document.querySelector('[data-nav-group="plans"]'))`)
    // Settings opens in the nav, so its pages are items to hover and focus.
    await page.evaluate(`document.querySelector('[data-nav-group="settings"]').click()`)
    await page.until(`Boolean(document.querySelector('[data-nav-item="settings/models"]'))`)
    await settle()
    const read = (key) => page.evaluate(`(() => { const el = document.querySelector('[data-nav-item="${key}"]'), s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, weight: s.fontWeight, outline: s.outlineStyle } })()`)
    const before = await read('settings/models')
    const selected = await read('settings/workspaces')
    const box = await page.evaluate(`(() => { document.querySelector('[data-nav-item="settings/models"]').scrollIntoView({ block: 'center' }); const r = document.querySelector('[data-nav-item="settings/models"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })()`)
    await page.hover(box[0], box[1])
    await settle()
    const hover = await read('settings/models')
    assert.notEqual(hover.bg, before.bg, 'hover changes the background')
    assert.notEqual(hover.color, before.color, 'hover changes the text color')
    assert.notDeepEqual([hover.bg, hover.color, hover.weight], [selected.bg, selected.color, selected.weight], 'hover differs from the selected item')
    await page.hover(5, 5)
    await page.key('Tab', 'Tab', 9)
    await page.evaluate(`document.querySelector('[data-nav-item="settings/plugins"]').focus()`)
    assert.equal((await read('settings/plugins')).outline, 'solid', 'keyboard focus shows a ring')
    // A section header changes color on hover too.
    const head = await page.evaluate(`(() => { const r = document.querySelector('[data-nav-group="flow"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })()`)
    const headBefore = await page.evaluate(`getComputedStyle(document.querySelector('[data-nav-group="flow"]')).color`)
    await page.hover(head[0], head[1])
    await settle()
    assert.notEqual(await page.evaluate(`getComputedStyle(document.querySelector('[data-nav-group="flow"]')).color`), headBefore, 'a header changes color on hover')
  }
})

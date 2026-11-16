// The left nav at 390 px (the phone's menu) and 1280 px, light and dark, in
// a real Chrome: nothing in a nav pill or its open rows passes the pill's
// edges, the Needs you count stays inside its pill, every open section's
// rows start at the same x, and the workspace pill is first and cut short.
// A long workspace name and 12 Needs you items make it tight. Home sends
// only its own reads. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness, realLucide } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the nav overflow test'
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

// Every element in a pill (a nav section or the workspace pill) whose box
// passes the pill's inner edges, left or right.
const OVERFLOWS = (width) => `(() => {
  const out = []
  const name = (el) => el.tagName.toLowerCase() + ' "' + (el.textContent || '').trim().slice(0, 30) + '"'
  const pills = [...document.querySelectorAll('${scope(width)} [data-nav-section], ${scope(width)} [data-workspace-pill]')]
  for (const pill of pills) {
    const p = pill.getBoundingClientRect(), s = getComputedStyle(pill)
    const left = p.left + parseFloat(s.borderLeftWidth), right = p.right - parseFloat(s.borderRightWidth)
    if (p.right > innerWidth + 1 || p.left < -1) out.push('pill past the screen: ' + name(pill))
    for (const el of pill.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || el.closest('[data-workspace-menu]')) continue
      if (r.right > right + 1 || r.left < left - 1) out.push(name(el) + ' in ' + name(pill) + ': ' + Math.round(r.left) + '-' + Math.round(r.right) + ' vs ' + Math.round(left) + '-' + Math.round(right))
    }
  }
  return out.slice(0, 10)
})()`

const open = async (width, text) => {
  await page.evaluate(`(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`)
  await wait()
}

for (const [width, height] of [
  [390, 844],
  [1280, 800],
])
  for (const dark of [false, true])
    test(`at ${width} px ${dark ? 'dark' : 'light'}: nav pills and their rows stay inside, and rows line up`, { skip }, async () => {
      await page.open(harness.url({ page: 'app', theme: dark ? 'dark' : 'light', needs: '12', long: '1', specs: '1', activity: '1' }), { width, height, dark })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      if (width < 768) {
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await page.until(`Boolean(document.querySelector('[data-top-rail-list]'))`)
        // The open menu's bar is only its close button: no second page pill.
        assert.equal(await page.evaluate(`document.querySelector('[data-top-rail-bar]').textContent.trim()`), '', 'no page label over the open menu')
      }
      await page.until(`Boolean(document.querySelector('${scope(width)} [data-nav-count]'))`)
      // The workspace pill is first, inside the nav, and its long name is cut short.
      const pill = await page.evaluate(`(() => {
        const nav = document.querySelector('${scope(width)}'), pill = nav.querySelector('[data-workspace-pill]'), name = pill.querySelector('span')
        const first = [...nav.querySelectorAll('[data-workspace-pill], [data-nav-section]')][0]
        return { first: first === pill, cut: name.scrollWidth > name.clientWidth, inMain: Boolean(document.querySelector('[data-main-top] [data-workspace-pill], [data-main-top] select')) }
      })()`)
      assert.deepEqual(pill, { first: true, cut: true, inMain: false })
      const lefts = {}
      for (const section of ['Dashboards', 'Specs', 'Needs you', 'Flow', 'Activity', 'Settings']) {
        if (width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
        await open(width, section)
        assert.deepEqual(await page.evaluate(OVERFLOWS(width)), [], `${section} open`)
        const left = await page.evaluate(`(() => { const s = document.querySelector('${scope(width)} [data-nav-section][data-open]'); const row = s?.querySelector('[data-nav-children] > [data-nav-item]'); return row ? Math.round(row.getBoundingClientRect().left - s.getBoundingClientRect().left) : null })()`)
        if (left !== null) lefts[section] = left
      }
      assert.ok(Object.keys(lefts).length >= 4, JSON.stringify(lefts))
      assert.equal(new Set(Object.values(lefts)).size, 1, `rows start at one x in every section: ${JSON.stringify(lefts)}`)
      // The Needs you count is whole and inside its pill's header.
      const count = await page.evaluate(`(() => { const c = document.querySelector('${scope(width)} [data-nav-count]'), h = c.closest('[data-nav-head]'); const a = c.getBoundingClientRect(), b = h.getBoundingClientRect(); return { inside: a.left >= b.left && a.right <= b.right, text: c.textContent } })()`)
      assert.deepEqual(count, { inside: true, text: '12' })
    })

// Home's reads, by name. A new read on Home (or one that calls GitHub) has
// to be added here on purpose.
const HOME_READS = new Set(['workspaces.list', 'instance.view', 'flow.view', 'driversession.view', 'graph.view', 'delivery.view', 'conflicts.view', 'plan.list', 'radar.crews', 'repositories.list', 'github.settings.get', 'untriaged.view', 'radar.releasequeue', 'gate.list', 'integration.view', 'review.drafts'])

test('Home sends only its own reads, and shows its cards before the slow Radar read lands', { skip }, async () => {
  await page.open(harness.url({ page: 'app', theme: 'light', needs: '3', slowradar: '1' }), { width: 1280, height: 800 })
  // Radar never answers here, and Needs you still fills.
  await page.until(`document.body.textContent.includes('Needs you (3)')`, 10000)
  await wait(600)
  const ops = await page.evaluate('window.__ops || []')
  assert.deepEqual(ops.filter((op) => !HOME_READS.has(op)), [])
  assert.ok(ops.includes('radar.crews'), 'Radar was asked')
  // The release queue row is there too, not held back behind Radar.
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-dashboard-row="queue-progress"]'))`), true)
})

// Every icon on the page draws a glyph: the host's lucide-react icon, never
// the harness's stand-in circle, and never an empty <svg>. Needs the
// lucide-react dev dependency (the host's version).
const ICONS = `(() => {
  const out = []
  for (const svg of document.querySelectorAll('[data-shell] svg')) {
    const r = svg.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const shapes = svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse')
    const drawn = [...shapes].some((s) => { try { const b = s.getBBox(); return b.width > 0 || b.height > 0 } catch { return false } })
    if (svg.hasAttribute('data-stub-icon') || !drawn) out.push((svg.closest('[aria-label]')?.getAttribute('aria-label') || svg.parentElement?.textContent?.trim().slice(0, 30) || svg.outerHTML.slice(0, 60)))
  }
  return out.slice(0, 10)
})()`

test('every icon on Home, in the nav and the phone menu draws a glyph', { skip: skip || (realLucide ? false : 'lucide-react is not installed (npm ci installs it)') }, async () => {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    await page.open(harness.url({ page: 'app', theme: 'light', needs: '3' }), { width, height })
    await page.until(`document.body.textContent.includes('Needs you (3)') || Boolean(document.querySelector('[data-top-rail-bar]'))`)
    await wait(500)
    if (width < 768) {
      await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await wait(300)
    }
    const count = await page.evaluate(`document.querySelectorAll('[data-shell] svg, [data-top-rail-list] svg').length`)
    assert.ok(count > 5, `icons drawn at ${width}px (${count})`)
    assert.deepEqual(await page.evaluate(ICONS.replace("'[data-shell] svg'", "'[data-shell] svg, [data-top-rail-list] svg'")), [], `no empty or stand-in icon at ${width}px`)
  }
})

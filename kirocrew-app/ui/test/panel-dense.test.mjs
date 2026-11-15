// The side panel is dense and works on a phone: rows are about two text lines
// tall (the earlier panel stacked a title, a detail and an action row, so a row
// was three or more lines), nothing scrolls sideways, tap targets are 44 px on
// a phone, nothing is sticky, and each row carries its facts. Measured in a real
// Chrome at 1280 px light and 390 px dark. Heights are compared with the row's
// own computed line height, not a fixed number. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the side panel density test'

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

const SIZES = [
  { name: 'desktop', width: 1280, height: 900, theme: 'light', dark: false, lines: 3.5 },
  { name: 'phone', width: 390, height: 800, theme: 'dark', dark: true, lines: 3.5 },
]
const open = async (size, query = {}) => {
  await page.open(harness.url({ page: 'panel', theme: size.theme, sid: 'chat-1', ...query }), { width: size.width, height: size.height, dark: size.dark })
  await page.until(`Boolean(document.querySelector('[data-flight-row]')) && Boolean(document.querySelector('[data-waiting-row]'))`)
}
const shot = async (size, name) => {
  const dir = process.env.AVOOZL_PANEL_SHOTS
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  await page.evaluate(`document.querySelector('[data-pp-toggle-all][aria-pressed=false]')?.click()`)
  await page.screenshot(path.join(dir, `${name}-${size.name}.png`))
}

for (const size of SIZES) {
  test(`rows are denser than three stacked lines at ${size.width} px ${size.theme}`, { skip }, async () => {
    await open(size)
    const rows = await page.evaluate(`[...document.querySelectorAll('[data-waiting-row], [data-flight-row], [data-queue-head], [data-recent-row]')].map((row) => {
      const title = row.querySelector('[data-pp-row-title], .font-medium') ?? row
      const lh = parseFloat(getComputedStyle(title).lineHeight) || parseFloat(getComputedStyle(title).fontSize) * 1.3
      return { multi: row.hasAttribute('data-multi'), kind: row.dataset.waitingRow ?? row.dataset.flightRow ?? (row.hasAttribute('data-queue-head') ? 'queue' : 'recent'), height: row.getBoundingClientRect().height, lh }
    })`)
    assert.ok(rows.length >= 5, 'the sample has waiting, in flight, queue and recent rows')
    // A row with two actions puts them on a third line on a phone, so it may take up to two lines more.
    for (const row of rows) {
      const most = size.lines + (row.multi && size.width <= 640 ? 2.5 : 0)
      assert.ok(row.height <= row.lh * most, `${row.kind} row is ${row.height} px, ${(row.height / row.lh).toFixed(2)} lines; at most ${most}`)
    }
    await shot(size, 'dense')
  })

  test(`each row carries its facts at ${size.width} px ${size.theme}`, { skip }, async () => {
    await open(size)
    const flight = await page.evaluate(`document.querySelector('[data-flight-row="radar"]').textContent`)
    // Title, phase, pull request with its check state, claim age, Avoozl instance and crew.
    assert.match(flight, /Index builder/)
    assert.match(flight, /CI/)
    assert.match(flight, /PR #57 ✓/)
    assert.match(flight, /25m/)
    assert.match(flight, /Kelp/)
    assert.match(flight, /Draco/)
    assert.match(await page.evaluate(`document.querySelectorAll('[data-flight-row="radar"]')[1].textContent`), /PR #59 ✗ 1/)
    const waiting = await page.evaluate(`document.querySelector('[data-waiting-row="needs-human"]').textContent`)
    assert.match(waiting, /Needs you/)
    assert.match(waiting, /tokenizer A or B/)
    // The top: Stop the line state, the release queue, recent merges and the driver with its workspace.
    assert.match(await page.evaluate(`document.querySelector('[data-pp-status]').textContent`), /Line running.*2 waiting on you · 3 in flight/)
    assert.match(await page.evaluate(`document.querySelector('[data-panel-fold="queue"] [data-pp-section-head]').textContent`), /Release queue.*1 next · 1 held/)
    assert.match(await page.evaluate(`document.querySelector('[data-panel-fold="recent"] [data-pp-section-head]').textContent`), /Recent merges.*last 1h/)
    assert.match(await page.evaluate(`document.querySelector('[data-panel-driver]').textContent`), /Driver: not started/)
    // The Refresh button reads [↻ 32s] from the shared GitHub cache.
    assert.match(await page.evaluate(`document.querySelector('button[aria-label^="Refresh"]').textContent`), /^\d+s$/)
  })

  test(`nothing scrolls sideways and nothing is sticky at ${size.width} px ${size.theme}`, { skip }, async () => {
    await open(size)
    const layout = await page.evaluate(`(() => {
      const root = document.querySelector('[data-pp]').getBoundingClientRect()
      const wide = [...document.querySelectorAll('[data-pp] *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5).map((el) => el.tagName + ':' + el.textContent.slice(0, 20))
      const fixed = [...document.querySelectorAll('[data-pp], [data-pp] *')].filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position)).length
      const parent = document.querySelector('[data-pp]').parentElement.getBoundingClientRect().width
      return { scroll: document.documentElement.scrollWidth, width: innerWidth, rootWidth: root.width, parent, wide, fixed }
    })()`)
    assert.ok(layout.scroll <= layout.width, `page is ${layout.scroll} px wide in ${layout.width}`)
    assert.deepEqual(layout.wide, [])
    assert.ok(layout.rootWidth >= layout.parent - 1, 'the panel fills its container')
    if (size.width <= 640) assert.ok(layout.rootWidth >= layout.width - 1, 'on a phone the container is the whole screen')
    assert.equal(layout.fixed, 0)
  })
}

for (const size of SIZES)
  test(`nothing overflows or overlaps inside a row at ${size.width} px ${size.theme}`, { skip }, async () => {
    await open(size)
    const bad = await page.evaluate(`(() => {
      const out = []
      for (const row of document.querySelectorAll('[data-pp-row]')) {
        const box = row.getBoundingClientRect()
        const parts = [...row.querySelectorAll('[data-pp-row-title], [data-pp-chip], [data-pp-age], [data-pp-act]')].filter((el) => el.getBoundingClientRect().width > 0)
        for (const el of parts) if (el.getBoundingClientRect().right > box.right + 0.5) out.push('past the row: ' + el.textContent.trim().slice(0, 20))
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i].getBoundingClientRect(), b = parts[j].getBoundingClientRect()
          if (parts[i].contains(parts[j]) || parts[j].contains(parts[i])) continue
          if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) out.push('overlap: ' + parts[i].textContent.trim().slice(0, 14) + ' / ' + parts[j].textContent.trim().slice(0, 14))
        }
      }
      return out
    })()`)
    assert.deepEqual(bad, [])
  })

test('buttons are compact icon and text buttons, on a phone and a desktop', { skip }, async () => {
  const phone = SIZES[1]
  await open(phone)
  // Kiro Crew's own compact size: header icons 28 px, row buttons 28 px, section headers 40 px.
  const sizes = await page.evaluate(`({
    icons: [...document.querySelectorAll('[data-pp-head] button')].map((el) => el.getBoundingClientRect().height),
    acts: [...document.querySelectorAll('[data-pp-act]')].filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.getBoundingClientRect().height),
    heads: [...document.querySelectorAll('[data-pp-section-head]')].map((el) => el.getBoundingClientRect().height),
    header: document.querySelector('[data-pp-head]').getBoundingClientRect().height,
  })`)
  assert.ok(sizes.icons.length === 2 && sizes.icons.every((h) => h >= 27.5 && h <= 30), 'header icons ' + sizes.icons)
  assert.ok(sizes.acts.every((h) => h >= 27.5 && h <= 30), 'row buttons ' + sizes.acts)
  assert.ok(sizes.heads.every((h) => h >= 39.5 && h <= 44), 'section headers ' + sizes.heads)
  assert.ok(sizes.header <= 40, 'the header is ' + sizes.header)
  const desktop = SIZES[0]
  await open(desktop)
  const act = await page.evaluate(`Math.max(...[...document.querySelectorAll('[data-pp-act]')].map((el) => el.getBoundingClientRect().height))`)
  assert.ok(act < 44, `desktop actions stay compact (${act} px)`)
})

test('a new section is a few lines: every view is built from the shared parts', { skip: false }, () => {
  const panel = fs.readFileSync(new URL('../src/Panel.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(panel, /<details|<summary|<Badge|<Fold|<Muted/)
  assert.match(panel, /readPanel\(api, id\)/)
  // One read: no per-section client calls for the data the panel shows.
  assert.doesNotMatch(panel, /views\.(conflicts|radarCrews|remote)\(|flows\.view\(|releases\.queue\(|readDriverSession\(/)
})

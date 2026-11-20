// A draft spec's row has no Draft badge: its title is in the muted theme
// color (AA contrast in light and dark), the word Draft stays for screen
// readers and as a tooltip, and a legend line explains the grey. Other
// badges stay. Real Chrome; skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found'
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

// WCAG contrast of each title's color on the backdrop behind it (opaque
// ancestor backgrounds mixed from the first opaque one down).
const READ = `(() => {
  const rgb = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 } }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  const backdrop = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.a > 0) stack.push(c); if (c.a === 1) break } let out = { r: 255, g: 255, b: 255, a: 1 }; for (const c of stack.reverse()) out = mix(c, out); return out }
  const ratio = (el) => { const bg = backdrop(el), fg = mix(rgb(getComputedStyle(el).color), bg); const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
  return [...document.querySelectorAll('[data-spec-list] [data-plan-row]')].map((row) => {
    const title = row.querySelector('[data-spec-name]')
    return {
      name: row.textContent.trim().slice(0, 24),
      chip: row.dataset.specChip,
      draftTitle: title.dataset.specName === 'draft',
      tooltip: row.closest('[data-tooltip-anchor]')?.querySelector('[role=tooltip]')?.textContent ?? null,
      hidden: Boolean(title.querySelector('.sr-only')) && /Draft/.test(title.textContent),
      pillText: [...row.querySelectorAll('span')].some((s) => s.textContent.trim() === 'Draft' && !s.classList.contains('sr-only')),
      ratio: Math.round(ratio(title) * 100) / 100,
      color: getComputedStyle(title).color,
    }
  })
})()`

for (const theme of ['light', 'dark'])
  test(`draft rows show a muted title with no badge, AA contrast, and a legend (${theme})`, { skip }, async () => {
    await page.open(harness.url({ page: 'specs', theme }), { width: 1280, height: 900, dark: theme === 'dark' })
    await page.until(`Boolean(document.querySelector('[data-spec-list] [data-plan-row]'))`)
    const rows = await page.evaluate(READ)
    const drafts = rows.filter((r) => r.chip === 'draft')
    const others = rows.filter((r) => r.chip !== 'draft')
    assert.ok(drafts.length > 0, 'the fixture has drafts')
    for (const row of drafts) {
      assert.equal(row.draftTitle, true, row.name)
      assert.equal(row.tooltip, 'Draft', row.name)
      assert.equal(row.hidden, true, `${row.name} keeps a visually hidden Draft label`)
      assert.equal(row.pillText, false, `${row.name} has no Draft badge`)
      assert.ok(row.ratio >= 4.5, `${row.name} title contrast ${row.ratio} (${row.color})`)
    }
    // A row that is not a draft keeps its normal title color.
    for (const row of others) assert.notEqual(row.color, drafts[0].color, row.name)
    assert.match(await page.evaluate(`document.querySelector('[data-spec-legend]')?.textContent ?? ''`), /Grey titles are drafts/)
    // The legend sits at the top of the list, above the first row.
    assert.equal(
      await page.evaluate(
        `Boolean(document.querySelector('[data-spec-legend]').compareDocumentPosition(document.querySelector('[data-spec-list]')) & Node.DOCUMENT_POSITION_FOLLOWING)`,
      ),
      true,
    )
    // The selected row's tint keeps the contrast too.
    await page.evaluate(`document.querySelector('[data-plan-row][data-spec-chip="draft"]').click()`)
    await page.evaluate('new Promise((r) => setTimeout(r, 300))')
    const picked = (await page.evaluate(READ)).find((r) => r.chip === 'draft')
    assert.ok(picked.ratio >= 4.5, `selected title contrast ${picked.ratio}`)
    assert.deepEqual(page.errors, [])
  })

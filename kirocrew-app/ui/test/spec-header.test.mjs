// A spec's detail view reads like an Issue Radar issue view (sizes measured
// on Radar's own page): a header with the 27px title, a 12.5px meta line and
// an action row (state pill, spec ID, one filled primary button, a ... menu)
// over a divider; then cards with small-caps title rows beside a 236px rail
// of labeled sections. On a phone the rail stacks under the cards. Skipped
// when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'
import { readFileSync } from 'node:fs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the spec header tests'

test('the primary action: Import, Approve, Open in Spec Builder, or Edit spec', async () => {
  const source = readFileSync(new URL('../src/PlansView.tsx', import.meta.url), 'utf8')
  // The rule is a pure function; check it from its source with a tiny eval.
  const body = source.slice(source.indexOf('export function primaryAction('), source.indexOf('function specMeta('))
  const js = body.replace(/export function primaryAction\([^)]*\)[^{]*\{/, 'return (row, plan, blocker) => {').replace(/: 'import' \| 'approve' \| 'spec-builder' \| 'edit'/, '')
  const primaryAction = new Function(js)()
  assert.equal(primaryAction({ status: 'not imported', spec: 's' }, null, null), 'import')
  assert.equal(primaryAction({ status: 'draft', spec: 's' }, { state: 'draft' }, null), 'approve')
  assert.equal(primaryAction({ status: 'draft', spec: 's' }, { state: 'draft' }, 'Fix 2 errors first.'), 'spec-builder')
  assert.equal(primaryAction({ status: 'draft', spec: null }, { state: 'draft' }, 'Fix 2 errors first.'), 'edit')
  assert.equal(primaryAction({ status: 'approved', spec: 's' }, { state: 'approved' }, null), 'edit')
  assert.equal(primaryAction({ status: 'done', spec: 's' }, { state: 'approved' }, null), 'edit')
})

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

const wait = (ms = 300) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
const button = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`

async function openSpec(width, dark) {
  await page.open(harness.url({ page: 'demo', theme: dark ? 'dark' : 'light' }), { width, height: 900, dark })
  await page.until(`Boolean(${button('Start demo')})`)
  await click(button('Start demo'))
  await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
  if (width < 768) {
    await click(`document.querySelector('[data-top-rail-bar]')`)
    await wait(150)
  }
  await click(`document.querySelector('[data-nav-group="plans"]')`)
  // On a phone Specs opens to its filters in the menu; close it for the page.
  if (width < 768) await click(`document.querySelector('[data-top-rail-bar]')`)
  await page.until(`Boolean(document.querySelector('[data-plans-list]'))`)
  await click(button('Meal planner', `document.querySelector('[data-plans-list]')`))
  await page.until(`Boolean(document.querySelector('[data-spec-header]') && document.querySelector('[data-spec-rail] [data-state-count]'))`)
  await wait(500)
}

const READ = `(() => {
  const q = (s) => document.querySelector(s)
  const cs = (el) => getComputedStyle(el)
  const r = (el) => el.getBoundingClientRect()
  const title = q('#avoozl-plan-title'), meta = q('[data-spec-meta]'), row = q('[data-spec-actions]'), pill = q('[data-spec-state]'), id = q('[data-spec-id]'), primary = q('[data-spec-primary]')
  const main = q('#avoozl-plan-main'), rail = q('[data-spec-rail]')
  const cards = [...document.querySelectorAll('[data-spec-card]')]
  const heads = cards.map((c) => c.querySelector('[data-spec-card-head] h3'))
  const sections = [...rail.querySelectorAll('[data-rail-section]')]
  return {
    title: [cs(title).fontSize, cs(title).fontWeight, title.textContent.trim()],
    meta: [cs(meta).fontSize, meta.textContent.length > 0],
    rowDivider: cs(row).borderBottomWidth,
    order: [pill, id, primary].map((el) => Math.round(r(el).left)),
    pill: [cs(pill).fontSize, parseFloat(cs(pill).borderTopLeftRadius) > 100],
    primary: { filled: cs(primary).backgroundColor !== 'rgba(0, 0, 0, 0)' && cs(primary).backgroundColor !== cs(document.body).backgroundColor, height: Math.round(r(primary).height), text: primary.textContent.trim() },
    more: Boolean(q('[data-spec-more] [data-more-button]')),
    cardTitles: cards.map((c) => c.dataset.specCard),
    cardHeads: [...new Set(heads.map((h) => cs(h).fontSize + ' ' + cs(h).textTransform))],
    cardRadius: [...new Set(cards.map((c) => cs(c).borderTopLeftRadius))],
    sections: sections.map((s) => s.dataset.railSection.replace(/ \\(\\d+\\)$/, '')),
    edits: sections.filter((s) => s.querySelector('[data-rail-edit]')).map((s) => s.dataset.railSection),
    railFont: cs(rail).fontSize,
    // A desktop docks the details under the specs list; a phone stacks
    // them under the spec.
    railPlace: q('[data-list-pane="specs"] [data-spec-rail]') ? 'list' : rail.closest('[data-detail-column="specs"], [data-detail-pane-for="specs"]') && r(rail).top >= r(main).bottom - 1 ? 'under spec' : 'elsewhere',
    noOldAside: !q('[aria-label="Spec summary"]'),
    sideways: document.documentElement.scrollWidth > innerWidth,
  }
})()`

for (const dark of [false, true])
  for (const width of [1280, 390])
    test(`a spec reads like a Radar issue at ${width} px ${dark ? 'dark' : 'light'}`, { skip }, async () => {
      await openSpec(width, dark)
      const got = await page.evaluate(READ)
      assert.deepEqual(got.title, ['27px', '700', 'Meal planner'])
      assert.deepEqual(got.meta, ['12.5px', true])
      assert.equal(got.rowDivider, '1px', 'a divider under the header')
      assert.ok(got.order[0] < got.order[1] && got.order[1] < got.order[2], `pill, id, then the primary button (${got.order})`)
      assert.deepEqual(got.pill, ['12px', true])
      assert.equal(got.primary.filled, true, 'the primary button is filled')
      assert.ok(got.primary.height <= 28, `the primary button is compact (${got.primary.height})`)
      assert.equal(got.more, true, 'a ... menu')
      assert.ok(got.cardTitles.includes('Summary') && got.cardTitles.includes('Tasks by phase'), `cards (${got.cardTitles})`)
      assert.deepEqual(got.cardHeads, ['11px uppercase'], 'small caps card titles')
      assert.deepEqual(got.cardRadius, ['12px'])
      for (const name of ['Epic', 'Repositories', 'Phases', 'Progress', 'Dates']) assert.ok(got.sections.includes(name), `the rail has ${name}`)
      for (const name of ['Epic', 'Phases']) assert.ok(got.edits.includes(name), `${name} has Edit`)
      assert.equal(got.railFont, '12.5px')
      assert.equal(got.railPlace, width < 768 ? 'under spec' : 'list', 'where the details sit')
      assert.equal(got.noOldAside, true, 'no left column')
      assert.equal(got.sideways, false, 'no sideways scroll')
      // The ... menu holds the rest of the spec's actions.
      await click(`document.querySelector('[data-spec-more] [data-more-button]')`)
      await wait(200)
      const items = await page.evaluate(`[...document.querySelectorAll('[data-spec-more] [data-spec-menu-item]')].map((b) => b.textContent.trim())`)
      for (const name of ['New task', 'Delete', 'Open folder', 'Open on GitHub', 'Discuss spec']) assert.ok(items.includes(name), `the menu has ${name} (${items})`)
      assert.equal(items.at(-1), 'Delete', 'Delete is last')
      assert.deepEqual(page.errors, [])
    })

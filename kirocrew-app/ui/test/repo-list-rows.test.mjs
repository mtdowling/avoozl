// Settings > Repository setup rows show every repository fact inline, as a
// shared list item: a title line with icon actions, then muted facts. Empty
// facts are not rendered and rows are split by a top border only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { repositoryFacts, ruleLabels } from '../src/repository-rows.ts'
import { toForm } from '../src/settings-api.ts'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const form = toForm({
  mode: 'plans-repo',
  planningRepository: 'o/plans',
  repositories: {
    'o/api': {
      baseBranch: 'main',
      role: 'code',
      requiredChecks: ['ci'],
      merge: { method: 'squash' },
      rules: [{ id: 'r', action: 'plan', match: 'label:ready -label:blocked' }],
      untriaged: { triageLabels: ['triage'] },
    },
    'o/bare': { baseBranch: 'main', role: 'code' },
  },
})
const rowFor = (github, extra = {}) => ({
  key: github,
  name: github,
  checkout: { id: 'x', name: 'x', localCheckout: '/w/x', github, baseBranch: 'main', ...extra },
  policy: form.repositories.findIndex((e) => e.name === github),
  github,
  folder: '/w/x',
  branch: 'main',
})
const shown = (facts) => Object.fromEntries(facts.filter((f) => f.value?.trim() || f.chips?.length).map((f) => [f.label, f.chips ?? f.value]))

test('a row has the folder, landing, labels, merge method and checks', () => {
  const row = rowFor('o/api', { landing: 'train' })
  const facts = shown(repositoryFacts(row, form.repositories[row.policy]))
  assert.equal(facts.Folder, '/w/x')
  assert.equal(facts['Tasks land on'], 'main (train)')
  // Who codes was removed (R91.6).
  assert.equal(facts['Who codes'], undefined)
  assert.deepEqual(facts['Trigger labels'], ['ready'])
  assert.deepEqual(facts['Triage labels'], ['triage'])
  assert.equal(facts.Merge, 'squash')
  assert.equal(facts.Checks, 'ci')
})

test('a mirror row names its source, and the harness shows', () => {
  const row = rowFor('o/bare', { harness: 'kiro' })
  assert.equal(shown(repositoryFacts(row, form.repositories[row.policy], 'o/pub'))['Mirror of'], 'o/pub')
  assert.equal(shown(repositoryFacts({ ...row, policy: 0 }, form.repositories[0])).Harness, 'kiro')
})

test('empty facts are hidden', () => {
  const row = rowFor('o/bare')
  assert.deepEqual(Object.keys(shown(repositoryFacts(row, form.repositories[row.policy]))).sort(), ['Folder', 'Tasks land on'])
  assert.deepEqual(Object.keys(shown(repositoryFacts({ ...row, folder: null, checkout: null, policy: -1 }, null))), [])
})

test('only positive label: terms are triggers', () => {
  assert.deepEqual(ruleLabels('label:a,b -label:c label:"d e" author:x'), ['a', 'b', 'd e'])
})

test('the list rows and the workspace rows use the shared list item', () => {
  assert.match(source('RepositoriesSettings.tsx'), /<ListItem/)
  assert.match(source('WorkspaceView.tsx'), /<ListItem/)
  assert.match(source('ListItem.tsx'), /border-t py-2\.5 first:border-t-0/)
  assert.doesNotMatch(source('ListItem.tsx'), /rounded-lg|shadow|border-b/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the row layout test'
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

test('rows draw only a top border and show the facts in a real page', { skip }, async () => {
  for (const width of [1280, 390]) {
    await page.open(harness.url({ page: 'app', radar: '1', theme: 'light', roles: 'plans' }), { width, height: 900 })
    await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
    if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
    const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
    await page.until(`Boolean(document.querySelector('${scope} [data-nav-head]'))`)
    await page.evaluate(
      `(() => { const b = [...document.querySelectorAll('${scope} [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return true })()`,
    )
    await page.until(`[...document.querySelectorAll('${scope} [data-nav-item]')].some((x) => x.textContent.trim() === 'Repository setup')`)
    await page.evaluate(`[...document.querySelectorAll('${scope} [data-nav-item]')].find((x) => x.textContent.trim() === 'Repository setup').click()`)
    await page.until(`document.querySelectorAll('[data-repository-row]').length >= 3`)
    const seen = await page.evaluate(`(() => {
      const rows = [...document.querySelectorAll('[data-repository-row]')].map((li) => { const s = getComputedStyle(li); return { top: s.borderTopWidth, bottom: s.borderBottomWidth, left: s.borderLeftWidth, right: s.borderRightWidth, text: li.textContent } })
      const box = document.querySelector('[data-repository-row="checkout:recipe-box"]')
      const notes = document.querySelector('[data-repository-row="checkout:notes"]')
      return { rows, box: box.textContent, role: Boolean(box.querySelector('[data-role-badge]')), github: box.querySelector('[data-github-link]').textContent, chips: [...box.querySelectorAll('[data-chip]')].map((c) => c.textContent), notesFacts: [...notes.querySelectorAll('[data-fact]')].map((f) => f.dataset.fact), sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth }
    })()`)
    assert.ok(
      seen.rows.slice(1).every((r) => r.top === '1px'),
      `rows after the first have a top border at ${width}`,
    )
    assert.ok(
      seen.rows.every((r) => r.bottom === '0px' && r.left === '0px' && r.right === '0px'),
      'no other border',
    )
    assert.ok(seen.role)
    assert.equal(seen.github, 'acme/recipe-box')
    assert.match(seen.box, /\/src\/recipe-box/)
    assert.match(seen.box, /main \(pr\)/)
    assert.match(seen.box, /Harness:kiro/)
    assert.doesNotMatch(seen.box, /Who codes/)
    assert.deepEqual(seen.chips, ['ready', 'needs-triage'])
    assert.deepEqual(seen.notesFacts, ['Folder', 'Tasks land on'])
    assert.equal(seen.sideways, false, `no sideways scroll at ${width}`)
  }
})

// The spec details panel's Links box (task 44.2, R92.4, R92.9): the spec
// issue, working branch, open pull requests with a check dot each, and the
// Radar issues the spec came from. Every link opens a new tab with no
// opener; a missing record shows as None. Browser parts run in a real
// Chrome (AVOOZL_CHROME), skipped without one.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { demoReplies, demoScript } from './browser/demo-replies.mjs'
import { noLinksFixture, specLinksFixture } from './browser/spec-links-fixture.mjs'

const { checkDot, scmLinkText } = await import('../src/plans-api.ts')

test('link text and check dots: an older head is grey and says so', () => {
  const links = specLinksFixture()
  assert.equal(scmLinkText(links.issue), 'example/specs#40')
  assert.equal(scmLinkText(links.workingBranches[0]), 'avoozl/meal-planner/work')
  assert.equal(scmLinkText({ kind: 'commit', repository: 'a/b', sha: 'c'.repeat(40), url: '' }), 'ccccccc')
  const when = () => '4 min ago'
  assert.deepEqual(checkDot(links.pulls[0].checks, when), { label: 'Checks passed, read 4 min ago', color: 'var(--ok)' })
  assert.match(checkDot(links.pulls[1].checks, when).label, /^Checks running/)
  const stale = checkDot(links.pulls[2].checks, when)
  assert.equal(stale.color, 'var(--muted)')
  assert.match(stale.label, /older commit/)
  assert.equal(checkDot({ ...links.pulls[0].checks, dot: 'fail' }, when).color, 'var(--danger)')
  assert.deepEqual(checkDot(null, when), { label: 'No checks recorded', color: 'var(--muted)' })
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Links box tests'
let browser, page
const harnesses = {}
before(async () => {
  if (skip) return
  for (const [name, links] of [
    ['full', specLinksFixture()],
    ['empty', noLinksFixture()],
  ])
    harnesses[name] = await buildHarness({ scripts: { 'demo.js': demoScript(await demoReplies({ plan: { id: 'meal-planner', with: { links } } })) } })
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  for (const harness of Object.values(harnesses)) harness.remove()
})

const click = (expression) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
const button = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`

async function openSpec(harness, width) {
  const url = harness.url({ page: 'demo', theme: 'light' })
  await page.open(url, { width, height: 900 })
  await page.evaluate('localStorage.clear()')
  await page.open(url, { width, height: 900 })
  await page.until(`Boolean(${button('Start demo')})`)
  await click(button('Start demo'))
  await page.until(`Boolean(document.querySelector('[data-demo-bar]'))`)
  if (width < 768) await click(`document.querySelector('[data-top-rail-bar]')`)
  await click(`document.querySelector('[data-nav-group="plans"]')`)
  if (width < 768) await click(`document.querySelector('[data-top-rail-bar]')`)
  await page.until(`Boolean(document.querySelector('[data-plans-list]'))`)
  await click(button('Meal planner', `document.querySelector('[data-plans-list]')`))
  await page.until(
    `Boolean(document.querySelector('[data-spec-links] [data-spec-link]') || document.querySelector('[data-spec-links-row="Spec issue"] dd')?.textContent === 'None')`,
  )
}

const read = () =>
  page.evaluate(`(() => {
    const box = document.querySelector('[aria-label="Spec details"] [data-spec-links]')
    if (!box) return null
    const rows = Object.fromEntries([...box.querySelectorAll('[data-spec-links-row]')].map((r) => [r.dataset.specLinksRow, r.querySelector('dd').textContent]))
    const anchors = [...box.querySelectorAll('a')].map((a) => ({ href: a.href, target: a.target, rel: a.rel }))
    const dots = [...box.querySelectorAll('[data-check-dot]')].map((d) => [d.dataset.checkDot, d.getAttribute('aria-label')])
    const pulls = [...box.querySelectorAll('[data-spec-pull]')].map((li) => li.dataset.specPull)
    return { rows, anchors, dots, pulls }
  })()`)

for (const width of [1280, 390]) {
  test(`${width} px: the Links box shows the spec's GitHub items, each in a new tab`, { skip }, async () => {
    await openSpec(harnesses.full, width)
    const box = await read()
    assert.ok(box, 'the Links box is in the spec details panel')
    assert.equal(box.rows['Spec issue'], 'example/specs#40')
    assert.equal(box.rows['Working branch'], 'avoozl/meal-planner/work')
    assert.deepEqual(box.pulls, ['12', '14', '15'])
    assert.equal(box.rows['Radar issues'], 'example/radar#3')
    assert.deepEqual(
      box.dots.map(([dot]) => dot),
      ['pass', 'pending', 'stale'],
    )
    assert.match(box.dots[2][1], /older commit/)
    assert.ok(box.anchors.length >= 9)
    for (const a of box.anchors) {
      assert.match(a.href, /^https:\/\/github\.com\/example\//)
      assert.equal(a.target, '_blank')
      assert.equal(a.rel, 'noopener noreferrer')
    }
  })
}

test('missing records show as None and make no link', { skip }, async () => {
  await openSpec(harnesses.empty, 1280)
  const box = await read()
  assert.deepEqual(box.rows, { 'Spec issue': 'None', 'Working branch': 'None', 'Open pull requests': 'None', 'Radar issues': 'None' })
  assert.deepEqual(box.anchors, [])
})

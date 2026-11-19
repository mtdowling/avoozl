// Settings › GitHub as tabs (harness ?page=app&roles=single&ghfull=1): one
// full-width tab bar, one tab per group, arrow keys, the open tab in the
// address (?github=<tab>) for a pasted link and the browser's Back, the
// page's own Back (Alt+Left), a dot on a tab with unsaved changes, and a bar
// that scrolls sideways on a phone. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'
import { dirtyTabs, readTab, tabKey, tabLink } from '../src/tabs.ts'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the GitHub settings tabs tests'

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

const wait = (ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const click = (selector, text) =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((x) => x.textContent.trim() === ${JSON.stringify(text)}).at(-1); if (b) b.click(); return Boolean(b) })()`

async function openGitHub(width, extra = {}) {
  await page.open(harness.url({ page: 'app', roles: 'single', ghfull: '1', ...extra }), { width, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  if (extra.github) return page.until(`Boolean(document.querySelector('[data-tabs="avoozl-github-tab"]'))`)
  const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(150)
  await page.evaluate(
    `(() => { const b = [...document.querySelectorAll('${scope} [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return true })()`,
  )
  await wait(150)
  if (width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  assert.ok(await page.evaluate(click(`${scope} [data-nav-item]`, 'GitHub')))
  if (width < 768 && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await page.until(`Boolean(document.querySelector('[data-tabs="avoozl-github-tab"]'))`)
}

const READ = `(() => {
  const bar = document.querySelector('[data-tabs="avoozl-github-tab"]')
  const tabs = [...bar.querySelectorAll('[role=tab]')]
  const panel = document.querySelector('[role=tabpanel]')
  return {
    keys: tabs.map((t) => t.dataset.tab),
    labels: tabs.map((t) => t.textContent.trim()),
    selected: tabs.filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.dataset.tab),
    tabIndex: tabs.map((t) => t.tabIndex),
    focused: document.activeElement?.dataset?.tab ?? null,
    dots: tabs.filter((t) => t.querySelector('[data-tab-dot]')).map((t) => t.dataset.tab),
    panel: panel?.dataset.tabPanel ?? null,
    labelledBy: panel && document.getElementById(panel.getAttribute('aria-labelledby'))?.dataset.tab,
    sections: [...panel.querySelectorAll('[data-section]')].map((s) => s.dataset.section),
    barWidth: bar.getBoundingClientRect().width,
    rowWidth: bar.parentElement.getBoundingClientRect().width,
    tabWidths: tabs.map((t) => t.getBoundingClientRect().width),
    tabsSpan: tabs.at(-1).getBoundingClientRect().right - tabs[0].getBoundingClientRect().left,
    divider: getComputedStyle(bar).borderBottomWidth,
    filled: getComputedStyle(tabs.find((t) => t.getAttribute('aria-selected') === 'true')).backgroundColor,
    plain: getComputedStyle(tabs.find((t) => t.getAttribute('aria-selected') !== 'true')).backgroundColor,
    scrolls: getComputedStyle(bar).overflowX,
    barScroll: bar.scrollWidth > bar.clientWidth,
    pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }
})()`

test('tab logic: keys wrap, the address names a tab, a dirty tab is one whose keys changed', () => {
  const keys = ['issues', 'sync', 'calls']
  assert.equal(tabKey('ArrowRight', keys, 'calls'), 'issues')
  assert.equal(tabKey('ArrowLeft', keys, 'issues'), 'calls')
  assert.equal(tabKey('End', keys, 'issues'), 'calls')
  assert.equal(tabKey('Tab', keys, 'issues'), null)
  assert.equal(readTab('?page=app&github=sync', 'github', keys), 'sync')
  assert.equal(readTab('?github=nope', 'github', keys), null)
  assert.equal(readTab('', 'github', keys), null)
  assert.equal(tabLink('github', 'sync'), '?github=sync')
  const saved = { a: '1', b: { x: '' }, c: false }
  assert.deepEqual([...dirtyTabs({ ...saved, b: { x: 'y' } }, saved, { one: ['a'], two: ['b', 'c'], none: [] })], ['two'])
  assert.deepEqual([...dirtyTabs(saved, saved, { one: ['a'] })], [])
})

test('one full-width tab per group, arrow keys move between them', { skip }, async () => {
  await openGitHub(1280)
  let m = await page.evaluate(READ)
  assert.deepEqual(m.keys, ['issues', 'sync', 'setup', 'calls'])
  assert.deepEqual(m.labels, ['Epic issues', 'Sync pace', 'Set up GitHub', 'GitHub calls'])
  assert.deepEqual(m.selected, ['issues'])
  assert.deepEqual(m.tabIndex, [0, -1, -1, -1])
  assert.equal(m.panel, 'issues')
  assert.equal(m.labelledBy, 'issues')
  assert.deepEqual(m.sections, ['Epic issues'])
  assert.ok(Math.abs(m.barWidth - m.rowWidth) < 1, `bar ${m.barWidth} of ${m.rowWidth}`)
  // Kiro Crew's full-width bar: the tabs fill the row in equal shares, the
  // open one is filled, and no divider line runs under the bar.
  assert.ok(Math.abs(m.tabsSpan - m.barWidth) < 1, `tabs span ${m.tabsSpan} of ${m.barWidth}`)
  assert.ok(Math.max(...m.tabWidths) - Math.min(...m.tabWidths) < 1, `equal tabs ${m.tabWidths}`)
  assert.notEqual(m.filled, m.plain)
  assert.equal(m.divider, '0px')
  await page.evaluate(`document.querySelector('[data-tab="issues"]').focus()`)
  await page.key('ArrowRight', 'ArrowRight', 39)
  m = await page.evaluate(READ)
  assert.deepEqual(m.selected, ['sync'])
  assert.equal(m.focused, 'sync')
  assert.deepEqual(m.sections, ['Sync pace'])
  await page.key('End', 'End', 35)
  m = await page.evaluate(READ)
  assert.deepEqual(m.selected, ['calls'])
  assert.ok(m.sections.includes('GitHub calls'))
  await page.key('Home', 'Home', 36)
  assert.deepEqual((await page.evaluate(READ)).selected, ['issues'])
})

test('Back (Alt+Left) returns to the tab before', { skip }, async () => {
  await openGitHub(1280)
  assert.ok(await page.evaluate(click('[role=tab]', 'Sync pace')))
  assert.ok(await page.evaluate(click('[role=tab]', 'Set up GitHub')))
  assert.deepEqual((await page.evaluate(READ)).selected, ['setup'])
  const back = `(document.querySelector('[data-tab="setup"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })), true)`
  await page.evaluate(back)
  await wait(50)
  assert.deepEqual((await page.evaluate(READ)).selected, ['sync'])
})

test('the address opens a tab, and the browser moving the address moves the tab', { skip }, async () => {
  await openGitHub(1280, { github: 'setup' })
  let m = await page.evaluate(READ)
  assert.deepEqual(m.selected, ['setup'])
  assert.ok(m.sections.includes('Set up GitHub'))
  await page.evaluate(`(history.pushState(null, '', location.search.replace(/github=setup/, 'github=calls')), dispatchEvent(new PopStateEvent('popstate')), true)`)
  await wait(50)
  assert.deepEqual((await page.evaluate(READ)).selected, ['calls'])
  await page.evaluate(`(history.back(), true)`)
  await page.until(`document.querySelector('[role=tab][aria-selected=true]')?.dataset.tab === 'setup'`)
})

test('a tab with unsaved changes shows a dot until Save or Discard', { skip }, async () => {
  await openGitHub(1280)
  assert.ok(await page.evaluate(click('[role=tab]', 'Sync pace')))
  assert.deepEqual((await page.evaluate(READ)).dots, [])
  await page.evaluate(
    `(() => { const input = document.getElementById('avoozl-settings-writes-minute'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '30'); input.dispatchEvent(new Event('input', { bubbles: true })); return true })()`,
  )
  await page.until(`Boolean(document.querySelector('[data-save-footer]'))`)
  let m = await page.evaluate(READ)
  assert.deepEqual(m.dots, ['sync'])
  // The one Save bar stays on every tab, and so does the dot.
  assert.ok(await page.evaluate(click('[role=tab]', 'Epic issues')))
  m = await page.evaluate(READ)
  assert.deepEqual(m.dots, ['sync'])
  assert.ok(await page.evaluate(`Boolean(document.querySelector('[data-save-footer] [data-save]'))`))
  await page.evaluate(`document.querySelector('[data-save-footer] [data-discard]').click()`)
  await page.until(`!document.querySelector('[data-tab-dot]')`)
})

test('on a phone the bar scrolls sideways and the page does not', { skip }, async () => {
  await openGitHub(390)
  const m = await page.evaluate(READ)
  assert.equal(m.scrolls, 'auto')
  assert.equal(m.barScroll, true, 'five tabs do not fit 390 px')
  assert.equal(m.pageOverflow, false)
  assert.ok(await page.evaluate(click('[role=tab]', 'GitHub calls')))
  await wait(50)
  // The open tab is scrolled into the bar's view.
  const seen = await page.evaluate(
    `(() => { const bar = document.querySelector('[data-tabs="avoozl-github-tab"]'), t = bar.querySelector('[aria-selected=true]').getBoundingClientRect(), b = bar.getBoundingClientRect(); return t.left >= b.left - 1 && t.right <= b.right + 1 })()`,
  )
  assert.equal(seen, true)
})

// Every Settings page with fields draws them with the shared row, and no
// page keeps its own label, marker or raw-key markup.
test('each settings page uses the shared field row', () => {
  const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
  const pages = ['SettingsView.tsx', 'DeliverySettings.tsx', 'FlowSettings.tsx', 'ContentRulesSettings.tsx', 'CrewsRulesSettings.tsx']
  for (const name of pages) {
    const text = source(name)
    assert.match(text, /from '\.\/ui\/Field\.tsx'/, `${name} imports the shared field row`)
    assert.match(text, /<Field\b|<CheckRow\b/, `${name} draws a shared row`)
    assert.doesNotMatch(text, /\.avoozl\.json key|function Raw\(|function Field\(props: \{[^}]*\}\) \{\s*return \(\s*<div/, `${name} has no raw-key or field markup of its own`)
    assert.doesNotMatch(text, /<input type="checkbox"[^>]*\/>\s*\n?\s*[A-Z][^<{]*\n?\s*<\/label>/, `${name} has no bare checkbox setting`)
  }
  // The repository Edit dialog draws the repository editor, which is built from the same rows.
  assert.match(source('SettingsView.tsx'), /export function RepositoryEditor/)
  assert.match(source('ModelsSettings.tsx'), /<SaveFooter\b/, 'Models saves through the shared Save bar')
})

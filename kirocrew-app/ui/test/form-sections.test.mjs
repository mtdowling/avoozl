// Forms and modals that group fields use the one shared FormSection: a
// heading, then the fields, with no box. Groups after the first get a top
// border in the theme's border color. The browser tests are skipped when no
// Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const slice = (text, from, to) => text.slice(text.indexOf(from), to ? text.indexOf(to, text.indexOf(from) + from.length) : undefined)
// One top-level function, up to the next one.
const fn = (text, name) => {
  const at = text.indexOf(name)
  const next = text.slice(at + name.length).search(/\n(export )?(default )?(function|const) /)
  return next < 0 ? text.slice(at) : text.slice(at, at + name.length + next)
}

test('the repository, workspace and plugin dialogs group fields with FormSection, not boxes', () => {
  const modals = source('RepositoryModals.tsx')
  assert.match(slice(modals, 'export function ViewRepository', 'export function EditRepository'), /<FormSection title="Repository">/)
  assert.match(slice(modals, 'export function EditRepository'), /<FormSection title="Role">/)
  assert.match(slice(modals, 'export function EditRepository'), /<FormSection title="Public repository"/)
  const settings = source('SettingsView.tsx')
  for (const from of ['export function RepositoryEditor(', 'function LocalRepository(', 'function MirrorBox(', 'function UntriagedSettings(', 'function ReviewRoles(']) {
    const body = fn(settings, from)
    assert.match(body, /<FormSection/, from)
    assert.doesNotMatch(body, /<Card|<Section\b|<FieldBox|rounded(-lg)? border/, from)
  }
  const workspace = slice(source('WorkspaceView.tsx'), 'id="avoozl-ws-edit"', 'id="avoozl-ws-remove"')
  assert.match(workspace, /<FormSection title="Workspace">[\s\S]*<FormSection title="Running">/)
  assert.match(slice(source('AddPlugin.tsx'), 'data-plugin-review'), /<FormSection title="Settings pack"/)
  // One shared part, with the border in the theme's color.
  const part = source('FormSection.tsx')
  assert.match(part, /\[data-form-section\] ~ \[data-form-section\] \{ border-top: 1px solid var\(--border\); padding-top: 16px; \}/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the form section tests'
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
const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 300))')
const press = (selector, text) =>
  page.evaluate(
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`,
  )

// Inside a dialog: its sections, which have a top border, and every box
// around a group: an element with a border on all four sides that holds
// fields or a heading. Bordered controls and chips hold neither.
const LAYOUT = (dialog) => `(() => {
  const root = document.querySelector(${JSON.stringify(dialog)})
  const sections = [...root.querySelectorAll('[data-form-section]')].map((s) => ({ title: s.dataset.formSection, top: getComputedStyle(s).borderTopWidth, nested: Boolean(s.parentElement.closest('[data-form-section]')) }))
  const body = root.querySelector('[data-modal-body]')
  const boxes = [...body.querySelectorAll('*')].filter((el) => {
    if (!el.querySelector('input, select, textarea, label, h3, h4, dl, [data-form-section]')) return false
    const s = getComputedStyle(el)
    return ['Top', 'Right', 'Bottom', 'Left'].every((side) => parseFloat(s['border' + side + 'Width']) > 0 && s['border' + side + 'Style'] !== 'none')
  }).map((el) => el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''))
  return { sections, boxes }
})()`

test('the repository Edit modal is FormSections with no bordered boxes inside', { skip }, async () => {
  await page.open(harness.url({ page: 'app', radar: '1', theme: 'light', roles: 'plans' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return true })()`)
  await settle()
  await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-item]')].find((x) => x.textContent.trim() === 'Repository setup'); b?.click(); return true })()`)
  await page.until(`Boolean(document.querySelector('[data-repository-list]'))`)
  assert.equal(await press('[data-repository-list] button:not([disabled])', 'Edit '), true, 'a row has Edit')
  await page.until(`Boolean(document.querySelector('[data-repository-edit] [data-form-section]'))`)
  await settle()
  const { sections, boxes } = await page.evaluate(LAYOUT('[data-repository-edit]'))
  const top = sections.filter((s) => !s.nested)
  // The General tab opens first.
  assert.deepEqual(
    top.map((s) => s.title),
    ['Role', 'GitHub repository'],
  )
  assert.equal(top[0].top, '0px', 'the first section has no line')
  assert.equal(top[1].top, '1px', 'later sections start with a line')
  assert.deepEqual(boxes, [], 'no bordered boxes inside the Edit modal')
  // The View modal groups its facts the same way.
  await page.evaluate(`document.querySelector('[data-modal-footer-close]').click()`)
  await page.until(`!document.querySelector('[data-repository-edit]')`)
  assert.equal(await press('[data-repository-list] button', 'View '), true)
  await page.until(`Boolean(document.querySelector('[data-repository-view] [data-form-section]'))`)
  const view = await page.evaluate(LAYOUT('[data-repository-view]'))
  assert.equal(view.sections[0].title, 'Repository')
  assert.deepEqual(view.boxes, [])
})

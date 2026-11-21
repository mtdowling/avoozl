// Settings > Repository setup > Edit: every setting sits on a tab of the
// shared tab bar, and the one Save writes every
// tab's changes. Logic in node; the dialog in real Chrome on the harness
// (?page=app&roles=plans). The browser tests skip when no Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EDIT_TABS, EDIT_TAB_FIELDS, dirtyTabs, errorTabs } from '../src/repo-edit-tabs.ts'
import { emptyRepository } from '../src/settings-api.ts'
import { findChrome, type Harness, type Page } from './browser/chrome.ts'
import { withChrome } from './browser/harness-page.ts'

const source = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('each edited field belongs to exactly one tab', () => {
  const all = Object.values(EDIT_TAB_FIELDS).flat()
  assert.equal(new Set(all).size, all.length)
  assert.deepEqual(
    EDIT_TABS.map((t) => t.key),
    ['general', 'landing', 'github'],
  )
})

test('a tab shows a dot for its own unsaved changes and errors', () => {
  const saved = { ...emptyRepository('o/app'), baseBranch: 'main' }
  assert.deepEqual([...dirtyTabs({ saved, entry: null, roleChanged: false })], [])
  const entry = { ...saved, baseBranch: 'trunk', minimumPermission: 'maintain' }
  assert.deepEqual([...dirtyTabs({ saved, entry, roleChanged: true })].sort(), ['general', 'github', 'landing'])
  // A new entry is unsaved on every tab with fields.
  assert.deepEqual([...dirtyTabs({ saved: null, entry: saved, roleChanged: false })].sort(), ['general', 'github', 'landing'])
  assert.deepEqual([...errorTabs({ ...saved, name: ' ', baseBranch: '' })].sort(), ['general', 'landing'])
})

test('the dialog uses the shared tab bar and keeps nothing outside it', () => {
  const edit = source('RepositoryModals.tsx').slice(source('RepositoryModals.tsx').indexOf('export function EditRepository'))
  assert.match(edit, /<Tabs\s/)
  assert.match(edit, /<TabPanel /)
  assert.doesNotMatch(edit, /CoderPicker/)
  assert.doesNotMatch(source('SettingsView.tsx').slice(source('SettingsView.tsx').indexOf('export function RepositoryEditor(')), /^\s*<SegmentedControl/m)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Edit tabs tests'
let harness: Harness, page: Page
withChrome(chrome, (got) => ({ harness, page } = got))
const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 250))')
const press = (selector: string, text: string) =>
  page.evaluate(
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`,
  )
const tab = async (key: string) => {
  await page.evaluate(`document.querySelector('[data-repository-edit] [role=tab][data-tab="${key}"]').click()`)
  await page.until(`document.querySelector('[data-repository-edit] [role=tabpanel]')?.dataset.tabPanel === '${key}'`)
  await settle()
}
// Types into a React input or picks a select value.
const type = (selector: string, value: string) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    return true
  })()`)
const tabs = () =>
  page.evaluate<{ key: string; dirty: boolean; error: boolean }[]>(
    `[...document.querySelectorAll('[data-repository-edit] [role=tab]')].map((t) => ({ key: t.dataset.tab, dirty: t.dataset.dirty === 'true', error: t.dataset.error === 'true' }))`,
  )

async function openEdit(name: string) {
  await page.open(harness.url({ page: 'app', basic: '1', theme: 'light', roles: 'plans' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  await page.evaluate(
    `(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return true })()`,
  )
  await settle()
  await page.evaluate(
    `(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-item]')].find((x) => x.textContent.trim() === 'Repository setup'); b?.click(); return true })()`,
  )
  await page.until(`Boolean(document.querySelector('[data-repository-list]'))`)
  assert.equal(await press('[data-repository-list] button', `Edit ${name}`), true)
  await page.until(`Boolean(document.querySelector('[data-repository-edit] [role=tabpanel]'))`)
  await settle()
}

test('no setting renders outside a tab, on any tab', { skip }, async () => {
  await openEdit('recipe-box')
  // The dialog keeps the shared bar's rounded, spaced tabs; only the spec
  // page asks for the square heading look.
  assert.deepEqual(
    await page.evaluate(
      `(() => { const bar = document.querySelector('[data-repository-edit] [role=tablist]'); return [bar.dataset.tabsLook ?? null, getComputedStyle(bar.querySelector('[aria-selected=true]')).borderTopLeftRadius !== '0px', getComputedStyle(bar).columnGap] })()`,
    ),
    [null, true, '4px'],
  )
  assert.deepEqual(
    (await tabs()).map((t) => t.key),
    ['general', 'landing', 'github'],
  )
  for (const key of ['general', 'landing', 'github']) {
    await tab(key)
    const got = await page.evaluate<{ top: (string | null)[]; loose: string[]; fields: number }>(`(() => {
      const body = document.querySelector('[data-repository-edit] [data-modal-body]')
      const top = [...body.children].filter((el) => el.tagName !== 'STYLE').map((el) => el.getAttribute('role'))
      const loose = [...body.querySelectorAll('input, select, textarea, label, button, h3, h4')].filter((el) => !el.closest('[role=tabpanel], [role=tablist]')).map((el) => el.outerHTML.slice(0, 80))
      const fields = body.querySelectorAll('[role=tabpanel] input, [role=tabpanel] select, [role=tabpanel] textarea, [role=tabpanel] button').length
      return { top, loose, fields }
    })()`)
    assert.deepEqual(got.top, ['tablist', 'tabpanel'], key)
    assert.deepEqual(got.loose, [], key)
    assert.ok(got.fields > 0, `${key} has its settings`)
  }
  assert.deepEqual(page.errors, [])
})

test('saving from any tab saves every tab', { skip }, async () => {
  await openEdit('recipe-box')
  await tab('github')
  await type('[data-repository-edit] input[id$="-actors"]', 'sam')
  await tab('landing')
  await type('[data-repository-edit] input[id$="-base"]', 'trunk')
  await settle()
  const marks = Object.fromEntries((await tabs()).map((t) => [t.key, t.dirty]))
  assert.deepEqual(marks, { general: false, landing: true, github: true })
  await tab('general')
  assert.equal(await press('dialog[open] button', 'Save'), true)
  await page.until(`!document.querySelector('[data-repository-edit]')`)
  const write = await page.evaluate<{ github: { repositories: Record<string, Record<string, unknown>> } }>(
    `window.__harness.calls.filter((c) => c.operation === 'github.settings.update').at(-1)?.input`,
  )
  const entry = write.github.repositories['acme/recipe-box']
  assert.equal(entry.baseBranch, 'trunk')
  assert.deepEqual(entry.allowedActors, ['sam'])
  assert.deepEqual(page.errors, [])
})

// Settings > Repository setup has one way in, Add repository. After a repo is
// added, Set up GitHub and import specs opens the Onboard steps without the
// folder step. The repository modals have one Close each.
// The browser tests are skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('no separate Onboard box: Onboard.tsx exports only the dialog and nothing else opens it', () => {
  const onboard = source('Onboard.tsx')
  assert.doesNotMatch(onboard, /Onboard a repository|<Card>|data-onboard-folder|FolderStep/)
  assert.match(onboard, /export default function SetupRepository/)
  const users = readdirSync(new URL('../src/', import.meta.url)).filter((n) => /\.tsx$/.test(n) && /from '\.\/Onboard\.tsx'/.test(source(n)))
  assert.deepEqual(users, ['SettingsView.tsx'])
  assert.doesNotMatch(source('SettingsView.tsx'), /<Onboard\b/)
})

test('the repository modals add no Close or Cancel beside the shell Close', () => {
  const modals = source('RepositoryModals.tsx')
  const view = modals.slice(modals.indexOf('export function ViewRepository'), modals.indexOf('export function EditRepository'))
  assert.doesNotMatch(view, /footer=/)
  assert.doesNotMatch(view, /\n\s*Close\n/)
  assert.doesNotMatch(modals.slice(modals.indexOf('export function EditRepository')), /\n\s*(Close|Cancel)\n/)
  assert.doesNotMatch(source('MirrorSetup.tsx'), /\n\s*Close\n/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the add repository setup tests'
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
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
async function open() {
  await page.open(harness.url({ page: 'app', radar: '1', roles: 'plans' }), { width: 1280, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  await settle()
  await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return true })()`)
  await settle()
  await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-item]')].find((x) => x.textContent.trim() === 'Repository setup'); if (b) b.click(); return true })()`)
  await page.until(`Boolean(document.querySelector('[data-repository-list]'))`)
}
const footerButtons = `[...document.querySelectorAll('dialog[open] [data-modal-footer] button')].map((b) => b.textContent.trim())`

test('the page has one add entry and no Onboard box', { skip }, async () => {
  await open()
  const got = await page.evaluate(`({
    adds: document.querySelectorAll('[data-add-repository]').length,
    onboard: [...document.querySelectorAll('button, h3, h2')].filter((x) => /^Onboard/.test(x.textContent.trim())).length,
  })`)
  assert.deepEqual(got, { adds: 1, onboard: 0 })
  assert.deepEqual(page.errors, [])
})

test('View and Edit each have exactly one Close', { skip }, async () => {
  await open()
  await page.evaluate(press('[data-repository-list] button', 'View '))
  await page.until(`Boolean(document.querySelector('[data-repository-view]'))`)
  assert.deepEqual(await page.evaluate(footerButtons), ['Close'])
  assert.equal(await page.evaluate(`[...document.querySelectorAll('dialog[open] button')].filter((b) => b.textContent.trim() === 'Close').length`), 1)
  await page.evaluate(`document.querySelector('[data-modal-footer-close]').click()`)
  await page.until(`!document.querySelector('[data-repository-view]')`)
  await page.evaluate(press('[data-repository-list] button', 'Edit '))
  await page.until(`Boolean(document.querySelector('[data-repository-edit]'))`)
  assert.deepEqual(await page.evaluate(footerButtons), ['Save', 'Close'])
  assert.deepEqual(page.errors, [])
})

test('after Add repository, the setup action opens the Onboard steps without the folder step', { skip }, async () => {
  await open()
  await page.evaluate(`(() => { const i = document.getElementById('avoozl-repo-folder'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '/src/new-service'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await page.evaluate(press('[data-add-repository] button', 'Check folder'))
  await page.until(`Boolean(document.querySelector('[data-step="confirm"]'))`)
  await page.evaluate(press('[data-step="confirm"] button', 'Add repository'))
  await page.until(`Boolean(document.querySelector('[data-setup-offer] button'))`)
  await page.evaluate(`document.querySelector('[data-setup-offer] button').click()`)
  await page.until(`Boolean(document.querySelector('[data-onboard-mode]'))`)
  const got = await page.evaluate(`({
    steps: [...document.querySelectorAll('dialog[open] ol[aria-label="Steps"] li')].map((li) => li.textContent.trim()),
    folderField: Boolean(document.querySelector('dialog[open] [data-onboard-folder]')),
  })`)
  assert.equal(got.folderField, false)
  assert.ok(got.steps.length > 0 && got.steps.every((s) => !/Pick folder/.test(s)), got.steps.join(' | '))
  assert.match(got.steps[0], /^1\. Pick mode/)
  assert.deepEqual(page.errors, [])
})

test('a row has the setup action too', { skip }, async () => {
  await open()
  await page.evaluate(press('[data-repository-list] button', 'Set up GitHub and import specs for notes'))
  await page.until(`Boolean(document.querySelector('[data-onboard-mode]'))`)
  assert.deepEqual(page.errors, [])
})

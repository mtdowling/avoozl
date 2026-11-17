// Settings > Workspaces: each workspace's edit dialog has a red Remove at its
// footer's left. Its confirm says the folder, database and repositories stay,
// names the folder, and offers Stop it first while the workspace runs.
// Removing takes it off the list only (workspaces.remove, the CLI's
// `workspace remove`). Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const { isRunning, removeLines } = await import('../src/workspace-api.ts')

test('the confirm names the folder, says nothing is deleted, and asks to stop a running one first', () => {
  const on = { name: 'Nupp plans', root: '/plans/nupp', enabled: true, state: 'closed' }
  const lines = removeLines(on)
  assert.match(lines.join(' '), /off Avoozl's list/)
  assert.ok(lines.some((line) => line.includes('/plans/nupp')), 'names the folder')
  assert.match(lines.join(' '), /Its folder stays, with its database and repositories/)
  assert.match(lines.join(' '), /Nothing is deleted/)
  assert.match(lines.at(-1), /Stop it first/)
  assert.equal(isRunning(on), true)
  const off = { ...on, enabled: false, state: 'stopped' }
  assert.equal(isRunning(off), false)
  assert.doesNotMatch(removeLines(off).join(' '), /Stop it first/)
})

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the workspace remove tests'
// AVOOZL_SHOTS=<dir> keeps a shot of the dialog and its confirm.
const shots = process.env.AVOOZL_SHOTS || null
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
const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)

async function openRemove(width, dark, query = {}) {
  await page.open(harness.url({ page: 'workspaces', theme: dark ? 'dark' : 'light', ...query }), { width, height: 800, dark })
  await page.until(`Boolean(document.querySelector('[data-edit-workspace="launch"]'))`)
  await click('[data-edit-workspace="launch"]')
  await page.until(`Boolean(document.querySelector('[data-edit-workspace-modal] [data-remove-workspace]'))`)
  await wait()
}

for (const [width, dark] of [[1280, false], [1280, true], [390, false], [390, true]])
  test(`Remove is red at the left of the edit dialog's footer and asks first at ${width} px ${dark ? 'dark' : 'light'}`, { skip }, async () => {
    await openRemove(width, dark)
    const footer = await page.evaluate(`(() => {
      const foot = document.querySelector('[data-edit-workspace-modal] [data-modal-footer]')
      const remove = foot.querySelector('[data-remove-workspace]'), buttons = [...foot.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0)
      return { first: buttons[0] === remove, left: Math.round(remove.getBoundingClientRect().left - foot.getBoundingClientRect().left), color: getComputedStyle(remove).color, danger: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim(), text: remove.textContent.trim() }
    })()`)
    assert.equal(footer.first, true, 'the first footer button')
    assert.equal(await page.evaluate(`document.activeElement?.textContent.trim()`), 'Close', 'focus starts on Close, not Remove')
    assert.ok(footer.left <= 21, `at the footer's left (${footer.left})`)
    assert.equal(footer.text, 'Remove')
    assert.notEqual(footer.color, 'rgb(0, 0, 0)', 'red text')
    if (shots) {
      fs.mkdirSync(shots, { recursive: true })
      await page.screenshot(path.join(shots, `edit-${width}-${dark ? 'dark' : 'light'}.png`))
    }
    await click('[data-remove-workspace]')
    await page.until(`Boolean(document.querySelector('[data-remove-workspace-confirm]'))`)
    await wait()
    const confirm = await page.evaluate(`(() => {
      const box = document.querySelector('[data-remove-workspace-confirm]')
      return { title: box.querySelector('h2').textContent, lines: box.querySelector('[data-remove-lines]').textContent, buttons: [...box.querySelectorAll('[data-modal-footer] button')].map((b) => b.textContent.trim()) }
    })()`)
    assert.equal(confirm.title, 'Remove Product launch from Avoozl?')
    assert.match(confirm.lines, /\/plans\/launch/)
    assert.match(confirm.lines, /Nothing is deleted/)
    assert.deepEqual(confirm.buttons, ['Stop it first', 'Remove from list', 'Close'])
    if (shots) await page.screenshot(path.join(shots, `confirm-${width}-${dark ? 'dark' : 'light'}.png`))
    // Cancel goes back to the edit dialog and removes nothing.
    await page.evaluate(`[...document.querySelectorAll('[data-remove-workspace-confirm] button')].find((b) => b.textContent.trim() === 'Close').click()`)
    await page.until(`!document.querySelector('[data-remove-workspace-confirm]') && Boolean(document.querySelector('[data-edit-workspace-modal]'))`)
    assert.deepEqual(await page.evaluate('window.__wsCalls'), [])
    assert.deepEqual(page.errors, [])
  })

test('Remove from list takes it off the list; Stop it first stops, then removes', { skip }, async () => {
  await openRemove(1280, false)
  await click('[data-remove-workspace]')
  await page.until(`Boolean(document.querySelector('[data-remove-confirm]'))`)
  await click('[data-remove-confirm]')
  await page.until(`!document.querySelector('[data-edit-workspace="launch"]')`)
  assert.deepEqual(await page.evaluate('window.__wsCalls'), ['remove launch'])
  assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-edit-workspace="nupp"]'))`), true, 'the other one stays')

  await openRemove(1280, false)
  await click('[data-remove-workspace]')
  await page.until(`Boolean(document.querySelector('[data-remove-stop-first]'))`)
  await click('[data-remove-stop-first]')
  await page.until(`!document.querySelector('[data-edit-workspace="launch"]')`)
  assert.deepEqual(await page.evaluate('window.__wsCalls'), ['stop launch', 'remove launch'])
})

test('a workspace that is already off has no Stop it first', { skip }, async () => {
  await openRemove(1280, false, { stopped: '1' })
  await click('[data-remove-workspace]')
  await page.until(`Boolean(document.querySelector('[data-remove-workspace-confirm]'))`)
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-remove-workspace-confirm] [data-modal-footer] button')].map((b) => b.textContent.trim())`), ['Remove from list', 'Close'])
})

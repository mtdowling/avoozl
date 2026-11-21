// Settings > Content rules in Chrome (?page=app&rules=one): Content rules
// guide opens docs/content-rules.md in the full-file reader, and Close shuts
// it. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { harnessPage } from './browser/harness-page.mjs'

const state = harnessPage('content rules guide')
const { skip } = state
const wait = (ms) => state.page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const reader = (expr) => state.page.evaluate(`(() => { const r = document.querySelector('[data-document-reader]'); return r ? ${expr} : null })()`)

test('Content rules guide opens docs/content-rules.md in the reader', { skip }, async () => {
  await state.page.open(state.harness.url({ page: 'app', roles: 'single', rules: 'one' }), { width: 1280, height: 900 })
  await state.page.until(`Boolean(document.querySelector('[data-left-nav]'))`)
  await wait(200)
  await state.page.evaluate(
    `(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return true })()`,
  )
  await wait(200)
  await state.page.evaluate(
    `(() => { const b = [...document.querySelectorAll('[data-left-nav] [data-nav-item]')].filter((x) => x.textContent.trim() === 'Content rules').at(-1); b.click(); return true })()`,
  )
  await state.page.until(`Boolean(document.querySelector('[data-rules-design]'))`)
  assert.equal(await reader('true'), null, 'closed at first')
  const clicked = await state.page.evaluate(
    `(() => { const b = [...document.querySelectorAll('[data-rules-design] button')].find((x) => x.textContent.trim() === 'Content rules guide'); if (b) b.click(); return Boolean(b) })()`,
  )
  assert.ok(clicked, 'the button is there')
  await state.page.until(`Boolean(document.querySelector('[data-document-reader] [role=heading]'))`)
  assert.match(await reader('r.textContent'), /docs\/content-rules\.md/)
  const headings = await reader(`JSON.stringify([...r.querySelectorAll('[role=heading]')].map((h) => h.textContent))`)
  for (const heading of ['Content rules', 'Rule sets', 'Allow lines']) assert.ok(JSON.parse(headings).includes(heading), heading)
  assert.equal(await reader(`Boolean([...r.querySelectorAll('button')].find((b) => b.textContent.includes('Reveal')))`), false, 'a bundled file has nothing to reveal')
  await reader(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Close').click()`)
  await wait(300)
  assert.equal(await reader('true'), null, 'Close shuts it')
})

// Settings › Models picks a harness per role (R98.3): the worker has a
// harness and no model, and a save sends `harnesses` beside `models`.
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

const pick = (id, text) => `(() => {
  const option = [...document.querySelectorAll('#${id}-list [role="option"]')].find((item) => item.textContent.trim() === ${JSON.stringify(text)})
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
})()`

for (const width of [390, 1280]) {
  test(`each role picks a harness and the worker's saves at ${width}px`, { skip }, async () => {
    await page.open(harness.url({ page: 'models' }), { width, height: 900 })
    await page.until(`Boolean(document.querySelector('#avoozl-harness-worker'))`)
    for (const role of ['worker', 'planner', 'planReviewer', 'retro', 'reviewDraft'])
      assert.equal(await page.evaluate(`Boolean(document.querySelector('#avoozl-harness-${role}'))`), true, role)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('#avoozl-model-worker'))`), false)
    assert.match(await page.evaluate(`document.querySelector('[data-model-role="worker"]').textContent`), /set in Delivery/)
    assert.equal(await page.evaluate(`document.querySelector('#avoozl-harness-worker').value`), 'auto (project default)')
    await page.evaluate(`document.querySelector('#avoozl-harness-worker').focus()`)
    await page.until(`document.querySelector('#avoozl-harness-worker').getAttribute('aria-expanded') === 'true'`)
    assert.deepEqual(
      await page.evaluate(`[...document.querySelectorAll('#avoozl-harness-worker-list [role="option"]')].map((o) => o.textContent.trim())`),
      ['auto (project default)', 'Kiro Crew chat', 'claude-code', 'codex (not approved)'],
    )
    await page.evaluate(pick('avoozl-harness-worker', 'claude-code'))
    // The retro follows its harness; review drafts say they still run as a chat.
    await page.evaluate(`document.querySelector('#avoozl-harness-retro').focus()`)
    await page.until(`document.querySelector('#avoozl-harness-retro').getAttribute('aria-expanded') === 'true'`)
    await page.evaluate(pick('avoozl-harness-retro', 'claude-code'))
    await page.evaluate(`document.querySelector('#avoozl-harness-reviewDraft').focus()`)
    await page.until(`document.querySelector('#avoozl-harness-reviewDraft').getAttribute('aria-expanded') === 'true'`)
    await page.evaluate(pick('avoozl-harness-reviewDraft', 'claude-code'))
    await page.until(`Boolean(document.querySelector('[data-model-role="reviewDraft"] [data-harness-pending]'))`)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-model-role="retro"] [data-harness-pending]'))`), false)
    await page.until(`document.querySelector('[data-save-footer] [data-save]')?.disabled === false`)
    await page.evaluate(`document.querySelector('[data-save-footer] [data-save]').click()`)
    await page.until(`document.querySelector('[data-models-settings]').textContent.includes('Saved to .avoozl.json.')`)
    const calls = await page.evaluate(`window.__harness.calls.filter((call) => call.operation === 'models.settings.update').map((call) => call.input)`)
    assert.deepEqual(calls.at(-1), {
      models: { planner: 'fake-writer' },
      harnesses: { worker: 'claude-code', retro: 'claude-code', reviewDraft: 'claude-code' },
      expectedHash: 'models-before',
    })
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  })
}

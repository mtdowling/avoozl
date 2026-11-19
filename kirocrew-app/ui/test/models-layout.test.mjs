// Settings › Models is one row per role: default or set here with Reset,
// the harness list once at the top, and a model a harness cannot take is
// dropped on pick.
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
const open = async (id) => {
  await page.evaluate(`document.querySelector('#${id}').focus()`)
  await page.until(`document.querySelector('#${id}').getAttribute('aria-expanded') === 'true'`)
}

for (const width of [390, 1280]) {
  test(`roles show default or set here, reset, and no model for a harness without one at ${width}px`, { skip }, async () => {
    await page.open(harness.url({ page: 'models' }), { width, height: 900 })
    await page.until(`Boolean(document.querySelector('#avoozl-harness-worker'))`)
    // The harness list and its hash status appear once.
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-harness-definition]').length`), 2)
    assert.match(await page.evaluate(`document.querySelector('[data-harness-definition="codex"]').textContent`), /not approved/)
    assert.match(await page.evaluate(`document.querySelector('[data-harness-definition="claude-code"]').textContent`), /hash approved/)
    const source = (role) => `document.querySelector('[data-model-role="${role}"]').dataset.source`
    assert.equal(await page.evaluate(source('planner')), 'set here')
    assert.equal(await page.evaluate(source('retro')), 'default')
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-model-role="retro"] [data-reset]'))`), false)
    assert.equal(await page.evaluate(`document.querySelector('[data-model-role="worker"] [data-role-access]').dataset.roleAccess`), 'write')
    assert.equal(await page.evaluate(`document.querySelector('[data-model-role="retro"] [data-role-access]').dataset.roleAccess`), 'read')
    assert.match(await page.evaluate(`document.querySelector('[data-second-model]').textContent`), /different model than the planner \(fake-writer\)/)
    if (width === 1280) {
      // Harness, model and source sit on one line with the role name.
      const tops = await page.evaluate(
        `['[data-model-role="retro"] > div', '[data-field-row="avoozl-harness-retro"]', '[data-field-row="avoozl-model-retro"]'].map((q) => Math.round(document.querySelector(q).getBoundingClientRect().top))`,
      )
      assert.ok(Math.abs(tops[0] - tops[1]) < 4 && Math.abs(tops[1] - tops[2]) < 4, tops.join())
    }
    // A harness with no model drops the model and shows why.
    await page.evaluate(`document.querySelector('[data-model-role="planner"] [data-reset]').click()`)
    await page.until(`document.querySelector('[data-model-role="planner"]').dataset.source === 'default'`)
    await page.evaluate(`document.querySelector('[data-save-footer] [data-discard]').click()`)
    await open('avoozl-harness-planner')
    await page.evaluate(pick('avoozl-harness-planner', 'codex (not approved)'))
    await page.until(`Boolean(document.querySelector('[data-model-role="planner"] [data-no-model]'))`)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('#avoozl-model-planner'))`), false)
    assert.equal(await page.evaluate(source('planner')), 'set here')
    // The same model for the planner and the plan reviewer cannot be saved.
    await page.evaluate(`document.querySelector('[data-model-role="planner"] [data-reset]').click()`)
    await page.until(`Boolean(document.querySelector('#avoozl-model-planner'))`)
    await open('avoozl-model-planner')
    await page.evaluate(pick('avoozl-model-planner', 'fake-writer'))
    await open('avoozl-model-planReviewer')
    await page.evaluate(pick('avoozl-model-planReviewer', 'fake-writer'))
    await page.until(`Boolean(document.querySelector('[data-model-role="planReviewer"] [data-role-problem]'))`)
    assert.equal(await page.evaluate(`document.querySelector('[data-save-footer] [data-save]').disabled`), true)
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  })
}

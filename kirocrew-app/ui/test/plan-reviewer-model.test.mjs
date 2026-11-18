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

for (const width of [390, 1280]) {
  test(`Plan reviewer shows unset auto and saves a chosen model at ${width}px`, { skip }, async () => {
    await page.open(harness.url({ page: 'models' }), { width, height: 800 })
    await page.until(`Boolean(document.querySelector('#avoozl-model-planReviewer'))`)
    await page.until(`document.querySelector('#avoozl-model-planReviewer').value === 'auto (no reviewer)'`)
    assert.equal(await page.evaluate(`document.querySelector('[data-model-role="planReviewer"] > span').textContent`), 'Plan reviewer')
    assert.match(await page.evaluate(`document.querySelector('[data-model-role="planReviewer"]').textContent`), /different model/)
    await page.evaluate(`document.querySelector('#avoozl-model-planReviewer').focus()`)
    await page.until(`document.querySelector('#avoozl-model-planReviewer').getAttribute('aria-expanded') === 'true'`)
    await page.evaluate(`(() => {
      const option = [...document.querySelectorAll('#avoozl-model-planReviewer-list [role="option"]')].find((item) => item.textContent.trim() === 'fake-reviewer')
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })()`)
    await page.until(`document.querySelector('[data-save-footer] [data-save]')?.disabled === false`)
    await page.evaluate(`document.querySelector('[data-save-footer] [data-save]').click()`)
    await page.until(`document.querySelector('[data-models-settings]').textContent.includes('Saved to .avoozl.json.')`)
    assert.deepEqual(await page.evaluate(`window.__harness.calls.filter((call) => call.operation === 'models.settings.update').map((call) => call.input)`), [{
      roles: { planner: { model: 'fake-writer' }, planReviewer: { model: 'fake-reviewer' } }, expectedHash: 'models-before',
    }])
    assert.equal(await page.evaluate(`document.querySelector('#avoozl-model-planReviewer').value`), 'fake-reviewer')
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  })
}

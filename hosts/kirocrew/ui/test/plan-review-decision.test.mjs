import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome(),
  skip = chrome ? false : 'no Chrome found'
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

for (const width of [390, 1280])
  for (const action of ['review', 'skip']) {
    test(`Needs you offers Review and Skip at ${width}px; ${action} sends the exact revision`, { skip }, async () => {
      await page.open(harness.url({ page: 'needs', draftReview: '1' }), {
        width,
        height: 800,
      })
      await page.until(`Boolean(document.querySelector('[data-conflict-pick]'))`)
      await page.evaluate(`document.querySelector('[data-conflict-pick]').click()`)
      await page.until(`Boolean(document.querySelector('[data-draft-review-choice] button'))`)
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-draft-review-choice] button')].map((button) => button.textContent.trim())`), ['Review', 'Skip'])
      await page.evaluate(`[...document.querySelectorAll('[data-draft-review-choice] button')].find((button) => button.textContent.trim().toLowerCase() === '${action}').click()`)
      await page.until(`document.querySelector('[data-draft-review-choice]').textContent.includes('${action === 'review' ? 'queued' : 'skipped'}')`)
      assert.deepEqual(await page.evaluate(`window.__harness.calls.filter((call) => call.operation === 'plan.review.decide').map((call) => call.input)`), [
        { planId: 'reader', revisionHash: 'a'.repeat(64), action },
      ])
      assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    })
  }

for (const delayed of [false, true])
  test(`same plan and hash in another workspace keep their choices after ${delayed ? 'a late' : 'a completed'} decision`, { skip }, async () => {
    await page.open(
      harness.url({
        page: 'needs',
        draftReview: '1',
        ...(delayed ? { draftDelay: '1' } : {}),
      }),
      { width: 1280, height: 800 },
    )
    await page.until(`Boolean(document.querySelector('[data-conflict-pick]'))`)
    await page.evaluate(`document.querySelector('[data-conflict-pick]').click()`)
    await page.until(`Boolean(document.querySelector('[data-draft-review-choice] button'))`)
    await page.evaluate(`document.querySelector('[data-draft-review-choice] button').click()`)
    if (!delayed) await page.until(`document.querySelector('[data-draft-review-choice]').textContent.includes('queued')`)
    await page.evaluate(`document.querySelector('[data-review-workspace]').click()`)
    await page.until(
      `document.querySelector('[data-review-workspace]').dataset.reviewWorkspace === 'other' && Boolean(document.querySelector('[data-draft-review-choice] button'))`,
    )
    if (delayed) await page.evaluate(`window.dispatchEvent(new Event('release-draft-review'))`)
    await page.until(`document.querySelector('[data-draft-review-choice] button')?.disabled === false`)
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-draft-review-choice] button')].map((button) => button.textContent.trim())`), ['Review', 'Skip'])
    assert.equal(await page.evaluate(`document.querySelector('[data-draft-review-choice]').textContent.includes('queued')`), false)
  })

// Settings > a repository > Mode and branch: Release N is the one concurrency
// knob, with its help line shown (it works on touch) and wired to the input;
// the retired Tasks at once field is gone. Real Chrome on the harness page
// ?page=repo-mode, at 1280 and 390 px. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Release N test'
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

for (const width of [1280, 390])
  test(`Mode and branch at ${width} px: Release N with its help line, and no Tasks at once`, { skip }, async () => {
    await page.open(harness.url({ page: 'repo-mode', theme: 'light' }), { width, height: 900 })
    await page.until(`Boolean(document.querySelector('input[id$="-release-capacity"]'))`)
    const field = await page.evaluate(`(() => {
      const input = document.querySelector('input[id$="-release-capacity"]')
      const label = document.querySelector('label[for="' + input.id + '"]').textContent
      const help = document.getElementById(input.getAttribute('aria-describedby'))
      return { label, help: help?.textContent.trim(), shown: Boolean(help && help.getBoundingClientRect().height > 0) }
    })()`)
    assert.match(field.label, /^Release N/)
    assert.equal(field.help, 'How many issues get the ready label at once. Crews pick from these.')
    assert.equal(field.shown, true)
    const text = await page.evaluate(`document.body.innerText`)
    assert.doesNotMatch(text, /Tasks at once/)
    assert.equal(await page.evaluate(`Boolean(document.querySelector('input[id$="-concurrency"]'))`), false)
  })

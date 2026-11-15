// New spec: Category and Epic are themed pickers with a "New …" choice, and
// Blank, From template and From a goal start unpicked; Submit waits for a pick. In a real
// Chrome (AVOOZL_CHROME) on the harness's ?modal=new-spec, at 390 and 1280 px,
// light and dark. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the New spec tests'
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
const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 120))')
const submit = `document.querySelector('button[type="submit"][form="avoozl-new-plan-form"]')`
const options = (id) => page.evaluate(`[...document.querySelectorAll('#${id}-list [role="option"]')].map((o) => o.textContent.trim())`)

for (const width of [390, 1280])
  for (const dark of [false, true])
    test(`at ${width} px ${dark ? 'dark' : 'light'}: themed pickers, no start picked, and Submit waits for one`, { skip }, async () => {
      await page.open(harness.url({ modal: 'new-spec', theme: dark ? 'dark' : 'light' }), { width, height: 900, dark })
      await page.evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open the dialog')?.click()`)
      await page.until(`Boolean(document.querySelector('[data-new-plan-drawer]'))`)
      await settle()
      // No native dropdowns.
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-new-plan-drawer] datalist, [data-new-plan-drawer] input[list]').length`), 0)
      // Neither start is picked; Submit is off and says why.
      assert.equal(await page.evaluate(`document.querySelectorAll('input[name="avoozl-new-plan-start"]:checked').length`), 0)
      assert.equal(await page.evaluate(`${submit}.disabled`), true)
      assert.match(await page.evaluate(`${submit}.textContent`), /Pick how to start/)
      assert.match(await page.evaluate(`document.querySelector('[data-radio-section="blank"]').textContent`), /requirements, then design, then tasks/)
      assert.match(await page.evaluate(`document.querySelector('[data-radio-section="template"]').textContent`), /phases, proofs and manual steps/)
      // From a goal is the third start: the planner chat writes the spec.
      assert.match(await page.evaluate(`document.querySelector('[data-radio-section="goal"]').textContent`), /From a goal[\s\S]*planner chat writes the draft spec/)
      assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('input[name="avoozl-new-plan-start"]')].map((i) => i.value)`), ['blank', 'template', 'goal'])
      // Category: the existing ones, then New category, which opens a field.
      await page.evaluate(`document.querySelector('#avoozl-new-plan-category').focus()`)
      await settle()
      assert.deepEqual(await options('avoozl-new-plan-category'), ['Platform', 'Search', 'New category…'])
      await page.evaluate(`[...document.querySelectorAll('#avoozl-new-plan-category-list [role="option"]')].at(-1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
      await settle()
      assert.equal(await page.evaluate(`Boolean(document.querySelector('#avoozl-new-plan-category-new'))`), true)
      // Epic: existing epics, then New epic.
      await page.evaluate(`document.querySelector('#avoozl-new-plan-epic').focus()`)
      await settle()
      assert.deepEqual(await options('avoozl-new-plan-epic'), ['SDK target architecture', 'New epic…'])
      await page.evaluate(`document.querySelectorAll('#avoozl-new-plan-epic-list [role="option"]')[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
      await settle()
      assert.equal(await page.evaluate(`document.querySelector('#avoozl-new-plan-epic').value`), 'SDK target architecture')
      // Picking Blank turns Submit on.
      await page.evaluate(`document.querySelector('input[name="avoozl-new-plan-start"][value="blank"]').click()`)
      await settle()
      assert.match(await page.evaluate(`${submit}.textContent`), /Open in Spec Builder/)
      await page.evaluate(`document.querySelector('input[name="avoozl-new-plan-start"][value="goal"]').click()`)
      await settle()
      assert.match(await page.evaluate(`${submit}.textContent`), /Open a planner chat/)
      assert.equal(await page.evaluate(`Boolean(document.querySelector('#avoozl-new-plan-goal'))`), true, 'the goal field')
      assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    })

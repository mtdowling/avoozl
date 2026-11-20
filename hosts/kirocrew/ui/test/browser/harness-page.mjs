// One headless page on the built harness for a test file: `skip` names why
// the file is skipped when no Chrome is found; `state.page` is the page once
// the file's tests run.
import { after, before } from 'node:test'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

export function harnessPage(what) {
  const chrome = findChrome()
  const state = { skip: chrome ? false : `no Chrome found; set AVOOZL_CHROME to run the ${what} tests` }
  before(async () => {
    if (state.skip) return
    state.harness = await buildHarness()
    state.browser = await launch(chrome)
    state.page = await state.browser.page()
  })
  after(async () => {
    await state.browser?.close()
    state.harness?.remove()
  })
  return state
}

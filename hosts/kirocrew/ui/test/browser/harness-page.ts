// One headless page on the built harness for a test file: `skip` names why
// the file is skipped when no Chrome is found; `state.page` is the page once
// the file's tests run.
import { after, before } from 'node:test'
import { buildHarness, type Harness } from './build.ts'
import { findChrome, launch, type Browser, type Page } from './chrome.ts'

export function harnessPage(what: string) {
  const chrome = findChrome()
  let harness: Harness | undefined, browser: Browser | undefined, page: Page | undefined
  // A test reads these only once `before` has made them.
  const made = <T>(value: T | undefined, name: string): T => {
    if (value === undefined) throw Error(`No ${name} before the ${what} tests run.`)
    return value
  }
  before(async () => {
    if (!chrome) return
    harness = await buildHarness()
    browser = await launch(chrome)
    page = await browser.page()
  })
  after(async () => {
    await browser?.close()
    harness?.remove()
  })
  return {
    skip: chrome ? false : `no Chrome found; set AVOOZL_CHROME to run the ${what} tests`,
    get harness() {
      return made(harness, 'harness')
    },
    get browser() {
      return made(browser, 'browser')
    },
    get page() {
      return made(page, 'page')
    },
  }
}

// One headless page on the built harness for a test file: `skip` names why
// the file is skipped when no Chrome is found; `state.page` is the page once
// the file's tests run.
import { after, before } from 'node:test'
import { buildHarness, type Harness, type HarnessOptions } from './build.ts'
import { findChrome, launch, startChrome, stopChrome, type Browser, type Page } from './chrome.ts'

// For a test file that keeps its own `harness` and `page`: when Chrome is
// there, `use` gets them before the tests run, and they stop after.
// `options` builds the harness, or makes the options first.
export function withChrome(
  chrome: string | null,
  use: (got: { harness: Harness; browser: Browser; page: Page }) => void,
  options: HarnessOptions | (() => Promise<HarnessOptions>) = {},
) {
  let got: { harness: Harness; browser: Browser } | undefined
  before(async () => {
    if (!chrome) return
    const started = await startChrome(chrome, typeof options === 'function' ? await options() : options)
    got = started
    use(started)
  })
  after(() => stopChrome(got?.browser, got?.harness))
}

// `options` builds the harness, such as on the host's own stylesheet.
export function harnessPage(what: string, options: HarnessOptions = {}) {
  const chrome = findChrome()
  let harness: Harness | undefined, browser: Browser | undefined, page: Page | undefined
  // A test reads these only once `before` has made them.
  const made = <T>(value: T | undefined, name: string): T => {
    if (value === undefined) throw Error(`No ${name} before the ${what} tests run.`)
    return value
  }
  before(async () => {
    if (!chrome) return
    harness = await buildHarness(options)
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

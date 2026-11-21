// What the screenshot scripts share: the start (the out folder from the
// command line, Chrome, and the harness on Kiro Crew's stylesheet, from
// shotCss()), and the full app's Specs page opened on a
// desktop or a phone.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.ts'
import { findChrome, launch, type Harness, type Page } from './chrome.ts'

// `usage` is the command line the script takes, for the message without one.
export async function startShots(usage: string) {
  const [out] = process.argv.slice(2)
  if (!out) {
    console.error(`Usage: ${usage}`)
    process.exit(2)
  }
  const chrome = findChrome()
  if (!chrome) {
    console.error('No Chrome found; set AVOOZL_CHROME.')
    process.exit(1)
  }
  fs.mkdirSync(out, { recursive: true })
  const harness = await buildHarness({ hostCss: await shotCss() })
  const browser = await launch(chrome)
  return { out, harness, browser }
}

export const click = (selector: string) => `document.querySelector(${JSON.stringify(selector)}).click()`

// Specs from the top row; a phone picks it in the top rail's menu, then
// closes the menu. Ends with `spec` open, or only the list when it is null.
export async function openSpecs(page: Page, width: number, settle: () => Promise<unknown>, spec: string | null = 'byte-types') {
  await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
  if (width < 768) {
    await page.evaluate(click('[data-top-rail-bar]'))
    await settle()
    await page.evaluate(`[...document.querySelectorAll('[data-top-rail-list] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
    await settle()
    if (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)) await page.evaluate(click('[data-top-rail-bar]'))
  } else await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
  if (!spec) return
  await page.until(`Boolean(document.querySelector('[data-plan-row="spec:${spec}"]'))`, 30000)
  await page.evaluate(click(`[data-plan-row="spec:${spec}"]`))
}

// One screenshot as <out>/<name>-<width>-<theme>.png, its path printed.
export async function saveShot(page: Page, out: string, name: string, width: number, theme: string) {
  const file = path.join(out, `${name}-${width}-${theme}.png`)
  await page.screenshot(file)
  console.log(file)
}

// The task details shots: the window height at each width, a shot that
// waits for the page to settle first, and the way into task details.
export const TASK_SHOT_HEIGHT: Record<number, number> = { 1280: 900, 390: 844 }
export const settledShot = (page: Page, out: string) => async (name: string, width: number, theme: string) => {
  await page.evaluate('new Promise((r) => setTimeout(r, 400))')
  await saveShot(page, out, name, width, theme)
}
// Home's Needs you row opens Item 1's task details.
export const openItemDetails = (page: Page) =>
  page.until(
    `(() => { const b = [...document.querySelectorAll('button, a')].find((b) => b.getAttribute('aria-label') === 'Details for Item 1' || b.textContent.trim().startsWith('Details for Item 1')); b?.click(); return Boolean(b) })()`,
    10000,
  )
// The Graph's Focus tree for S3, then O on its Y3 card.
export async function openFocusCard(page: Page, harness: Harness, width: number, theme: string) {
  await page.open(harness.url({ page: 'app', graph: 'chains', theme }), { width, height: TASK_SHOT_HEIGHT[width], dark: theme === 'dark' })
  await page.until(`Boolean(document.querySelector('[data-shell]'))`)
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]')?.click()`)
  await page.until(`Boolean(document.querySelector('[data-nav-group="graph"]'))`)
  await page.evaluate(`document.querySelector('[data-nav-group="graph"]').click()`)
  await page.until(`Boolean(document.querySelector('[data-frontier]'))`)
  await page.evaluate(`document.querySelector('[data-frontier-row="S3"] button').click()`)
  await page.evaluate(`[...document.querySelectorAll('[data-frontier-row="S3"] button')].find((b) => b.textContent.startsWith('open tree')).click()`)
  await page.until(`document.querySelector('[data-focus-tree]')?.dataset.focusTree === 'task:S3'`)
  await page.evaluate(`document.querySelector('[data-tree-node="Y3"]').focus()`)
  await page.key('o', 'KeyO', 79)
}

// Page helpers for the demo (?page=demo) shots: wait, click the element an
// expression names, and the expression for a button by its leading text.
export function demoHelpers(page: Page) {
  const wait = (ms = 300) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  const press = (expression: string) => page.evaluate(`(() => { const b = ${expression}; b.click(); return true })()`)
  const button = (text: string, scope = 'document') => `[...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
  // A fresh demo at `width`, on its Specs list.
  const openDemoSpecs = async (url: string, width: number, dark: boolean) => {
    await page.open(url, { width, height: 900, dark })
    await page.evaluate('localStorage.clear()')
    await page.open(url, { width, height: 900, dark })
    await page.until(`Boolean(document.querySelector('[data-top-row],[data-top-rail-bar]'))`)
    if (width < 768) {
      await press(`document.querySelector('[data-top-rail-bar]')`)
      await wait(150)
    }
    await press(`document.querySelector('[data-nav-group="plans"]')`)
    if (width < 768) await press(`document.querySelector('[data-top-rail-bar]')`)
    await page.until(`Boolean(document.querySelector('[data-plans-list]'))`)
  }
  return { wait, click: press, button, openDemoSpecs }
}

// Steps that open a nav section and one of its items: the top rail's menu on
// a phone, the left nav on a desktop. Each is a script for page.evaluate().
const navScope = (width: number) => (width < 768 ? '[data-top-rail-list]' : '[data-left-nav]')
export const menu = (width: number) =>
  width >= 768 ? 'true' : `(() => { if (!document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`
export const head = (width: number, section = 'Settings') =>
  `(() => { const b = [...document.querySelectorAll('${navScope(width)} [data-nav-head]')].find((x) => x.textContent.includes(${JSON.stringify(section)})); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`
export const item = (width: number, text: string) =>
  `(() => { const b = [...document.querySelectorAll('${navScope(width)} [data-nav-item]')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (b) b.click(); return Boolean(b) })()`
// The last match, in case another section has a page of the same name.
export const lastItem = (width: number, text: string) =>
  `(() => { const b = [...document.querySelectorAll('${navScope(width)} [data-nav-item]')].filter((x) => x.textContent.trim() === ${JSON.stringify(text)}).at(-1); if (b) b.click(); return Boolean(b) })()`

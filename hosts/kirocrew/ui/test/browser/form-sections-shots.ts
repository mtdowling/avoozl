#!/usr/bin/env node
// Screenshots of the dialogs that group fields with FormSection, in the full
// app shell on fake data (harness ?page=app&roles=plans): repository Edit
// and View under Settings > Repository setup, and workspace Edit under
// Settings > Workspaces. 1280 and 390 px, light and dark:
// <out>/<name>-<width>-<theme>.png.
//
//   node test/browser/form-sections-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import path from 'node:path'
import { startShots, menu, head, item } from './shots.ts'

const { out, harness, browser } = await startShots('form-sections-shots.mjs <out dir>')
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const click = (selector: string, text: string) =>
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => !x.disabled && (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  // Each shot: name, Settings item, steps, and an element to scroll to.
  const shots: [string, string, string[], string?][] = [
    ['repo-edit', 'Repository setup', [click('[data-repository-list] button', 'Edit ')]],
    ['repo-view', 'Repository setup', [click('[data-repository-list] button', 'View ')]],
    ['workspace-edit', 'Workspaces', [`(() => { document.querySelector('[data-edit-workspace]')?.click(); return true })()`]],
  ]
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, section, extra, at] of shots) {
        const size = { width, height: 900, dark: theme === 'dark' }
        await page.open(harness.url({ page: 'app', basic: '1', theme, roles: 'plans' }), size)
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of [menu(width), head(width), item(width, section), ...extra]) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        await page.evaluate(`document.querySelectorAll('dialog [data-modal-body], [data-modal-body]').forEach((x) => x.scrollTo(0, 0))`)
        if (at) await page.evaluate(`document.querySelector(${JSON.stringify(at)})?.scrollIntoView({ block: 'center' })`)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

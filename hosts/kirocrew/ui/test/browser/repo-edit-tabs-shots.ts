#!/usr/bin/env node
// Screenshots of a repository's Edit dialog (Settings > Repository setup),
// one per tab, in the full app shell on fake data (harness
// ?page=app&roles=plans). 1280 and 390 px, light and dark:
// <out>/<name>-<width>-<theme>.png.
// With names after <out>, only those shots. `before` takes the dialog as it
// opens, for a tree without tabs.
//
//   node test/browser/repo-edit-tabs-shots.mjs <out dir> [name...]
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from 'node:fs'
import path from 'node:path'
import { head, item, menu, startShots } from './shots.ts'

const { out, harness, browser } = await startShots('repo-edit-tabs-shots.mjs <out dir> [name...]')
const only = process.argv.slice(3)
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const click = (selector: string, text: string) =>
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => !x.disabled && (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  const tab = (key: string) => `(() => { document.querySelector('[data-repository-edit] [role=tab][data-tab="${key}"]')?.click(); return true })()`
  const shots: [string, string[]][] = [
    ['before', []],
    ['general', [tab('general')]],
    ['landing', [tab('landing')]],
    ['github', [tab('github')]],
    // The Isolation panel under Landing, scrolled into view.
    ['isolation', [tab('landing')]],
  ]
  const picked = shots.filter(([name]) => (only.length ? only.includes(name) : name !== 'before'))
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, extra] of picked) {
        await page.open(harness.url({ page: 'app', basic: '1', theme, roles: 'plans' }), { width, height: 900, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of [menu(width), head(width), item(width, 'Repository setup'), click('[data-repository-list] button', 'Edit recipe-box'), ...extra]) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        await page.evaluate(
          name === 'isolation'
            ? `document.querySelector('[data-isolation]')?.scrollIntoView({ block: 'center' })`
            : `document.querySelectorAll('[data-modal-body]').forEach((x) => x.scrollTo(0, 0))`,
        )
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

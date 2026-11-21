#!/usr/bin/env node
// @ts-nocheck: typing debt
// Screenshots of Repository setup and Settings › Workspaces in the full app
// shell on fake data (harness ?page=app&roles=...): desktop (1280 px) and
// phone (390 px), light and dark: <out>/<name>-<width>-<theme>.png.
//
//   node test/browser/repo-setup-list-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import path from 'node:path'
import { startShots, menu, head, item } from './shots.ts'

const { out, harness, browser } = await startShots('repo-setup-list-shots.mjs <out dir>')
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const press = (text) =>
    `(() => { const b = [...document.querySelectorAll('button, summary')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  const click = (selector, text) =>
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  const shots = [
    ['list', []],
    ['view', [click('[data-repository-list] button', 'View ')]],
    ['edit', [click('[data-repository-list] button', 'Edit ')]],
    ['confirm', [click('[data-repository-list] button', 'Remove ')]],
  ]
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, extra] of shots) {
        const size = { width, height: 900, dark: theme === 'dark' }
        const url = harness.url({ page: 'app', basic: '1', theme, roles: 'plans' })
        const steps = [menu(width), head(width), item(width, 'Repository setup'), ...extra]
        await page.open(url, size)
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of steps) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        await page.evaluate(`document.querySelectorAll('dialog [data-modal-body]').forEach((x) => x.scrollTo(0, 0))`)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

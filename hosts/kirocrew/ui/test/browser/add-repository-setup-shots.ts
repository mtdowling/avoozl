#!/usr/bin/env node
// Screenshots of Settings > Repository setup in the full app shell on fake
// data (harness ?page=app&roles=plans): the list with its setup action, the
// offer right after Add repository, the set-up dialog (no folder step) and
// the View modal with its one Close. 1280 and 390 px, light and dark:
// <out>/<name>-<width>-<theme>.png.
//
//   node test/browser/add-repository-setup-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import path from 'node:path'
import { startShots, menu, head, item } from './shots.ts'

const { out, harness, browser } = await startShots('add-repository-setup-shots.mjs <out dir>')
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const click = (selector: string, text: string) =>
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => (x.getAttribute('aria-label') || x.textContent).trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  const type = `(() => { const i = document.getElementById('avoozl-repo-folder'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '/src/new-service'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
  const added = [type, click('[data-add-repository] button', 'Check folder'), click('[data-step="confirm"] button', 'Add repository')]
  const shots = [
    ['list', []],
    ['view', [click('[data-repository-list] button', 'View ')]],
    ['added', added],
    ['setup', [...added, `document.querySelector('[data-setup-offer] button').click()`]],
  ]
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 390])
      for (const [name, extra] of shots) {
        const size = { width, height: 900, dark: theme === 'dark' }
        await page.open(harness.url({ page: 'app', basic: '1', theme, roles: 'plans' }), size)
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of [menu(width), head(width), item(width, 'Repository setup'), ...extra]) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        if (name === 'added') await page.evaluate(`document.querySelector('[data-setup-offer]')?.scrollIntoView({ block: 'center' })`)
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

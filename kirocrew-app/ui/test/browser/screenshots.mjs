#!/usr/bin/env node
// Screenshots of each modal open on the harness page, at 320, 768 and 1280
// px wide, light and dark: <out>/<modal>-<width>-<theme>.png.
//
//   node test/browser/screenshots.mjs <out dir> [modal ...]
//
// AVOOZL_CHROME names the browser. AVOOZL_HOST_CSS names the host's own
// stylesheet, so the page looks like the real one; without it the harness's
// small stylesheet is used.
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const SIZES = [
  [320, 640],
  [768, 1024],
  [1280, 800],
]
const OPENERS = { 'add-plugin': 'Add plugin', onboard: 'Onboard', confirm: 'Remove', 'stop-line': 'Stop the line', 'switch-model': 'Switch model' }
// Not modals: what to do once open, in place of waiting for the modal.
const PANELS = {
  'task-files': [`document.querySelector('[data-file="README.md"]')?.click() ?? false`, `Boolean(document.querySelector('[data-diff] [data-line]'))`],
  'task-files-split': [
    `document.querySelector('[data-file="README.md"]')?.click() ?? false`,
    `Boolean(document.querySelector('[data-diff] [data-line]'))`,
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Split')?.click() ?? false`,
    `Boolean(document.querySelector('[data-split-row]'))`,
  ],
}
const SCENARIO = { 'task-files-split': 'task-files' }
const ALL = ['add-plugin', 'onboard', 'repo-edit', 'setup-github', 'archive-plan', 'delete-plan', 'confirm', 'file-viewer', 'stop-line', 'pack-import', 'send-to-radar', 'crew', 'rule', 'switch-model']

const [out, ...asked] = process.argv.slice(2)
if (!out) {
  console.error('Usage: screenshots.mjs <out dir> [modal ...]')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
fs.mkdirSync(out, { recursive: true })
const harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS })
const browser = await launch(chrome)
try {
  const page = await browser.page()
  for (const name of asked.length ? asked : ALL) {
    const label = JSON.stringify(OPENERS[name] ?? 'Open the dialog')
    const opener = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${label})`
    for (const [width, height] of SIZES)
      for (const theme of ['light', 'dark']) {
        await page.open(harness.url({ modal: SCENARIO[name] ?? name, theme }), { width, height, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-graph] svg') && ${opener})`)
        await page.evaluate(`(() => { const b = ${opener}; b.focus(); b.click(); return true })()`)
        if (PANELS[name])
          for (const [i, step] of PANELS[name].entries()) await (i % 2 ? page.until(step) : page.evaluate(`(() => { ${step}; return true })()`))
        else await page.until(`Boolean(document.querySelector('[aria-modal="true"]'))`)
        await page.evaluate('new Promise((r) => setTimeout(r, 150))')
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  }
} finally {
  await browser.close()
  harness.remove()
}

#!/usr/bin/env node
// Screenshots of Settings page titles in the full app
// shell on fake data (harness ?page=app&roles=...): desktop (1280 px) and
// phone (390 px), light and dark: <out>/<name>-<width>-<theme>.png.
//
//   node test/browser/settings-titles-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import path from 'node:path'
import { startShots, menu, head, item } from './shots.ts'

const { out, harness, browser } = await startShots('settings-titles-shots.mjs <out dir>')
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  const shots = [
    ['repository-setup', 'Repository setup'],
    ['github', 'GitHub'],
    ['delivery', 'Autopilot'],
    ['content-rules', 'Content rules'],
    ['flow', 'Flow'],
    ['models', 'Models'],
    ['plugins', 'Plugins'],
    ['workspaces', 'Workspaces'],
  ]
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 375])
      for (const [name, tab] of shots) {
        const size = { width, height: 900, dark: theme === 'dark' }
        const url = harness.url({ page: 'app', basic: '1', theme, roles: 'plans', long: width < 768 ? '1' : '' })
        const steps = [menu(width), head(width), item(width, tab)]
        await page.open(url, size)
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of steps) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        const height = Math.min(4000, Math.ceil(await page.evaluate('document.documentElement.scrollHeight')))
        await page.open(url, { ...size, height })
        await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
        for (const step of steps) {
          await settle()
          await page.evaluate(step)
        }
        await settle()
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

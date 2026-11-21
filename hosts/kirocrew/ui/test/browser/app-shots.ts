#!/usr/bin/env node
// @ts-nocheck: typing debt
// Full-page screenshots of the real app on fake data (harness ?page=app),
// one per top tab and Settings tab, at 1280 px wide, light and dark:
// <out>/<name>-<theme>.png.
//
//   node test/browser/app-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import path from 'node:path'
import { startShots } from './shots.ts'

const TABS = ['Dashboard', 'Specs', 'Graph', 'Delivery', 'Flow', 'Conflicts', 'Intake', 'Activity', 'Settings']
const SETTINGS = ['Workspaces', 'Repositories', 'Plugins', 'Content rules', 'Flow', 'Autopilot']

const { out, harness, browser } = await startShots('app-shots.mjs <out dir>')
const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '-')
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 300))')
  const click = (text, scope = 'document') =>
    `(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`
  for (const theme of ['light', 'dark']) {
    const size = { width: 1280, height: 800, dark: theme === 'dark' }
    const shoot = async (name) => {
      await settle()
      const height = Math.min(4000, Math.ceil(await page.evaluate('document.documentElement.scrollHeight')))
      await page.open(page.lastUrl, { ...size, height })
      await page.until(`Boolean(document.querySelector('[data-top-row]'))`)
      for (const step of page.lastSteps) await page.evaluate(step)
      await settle()
      const file = path.join(out, `${name}-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
    const visit = async (name, steps) => {
      page.lastUrl = harness.url({ page: 'app', basic: '1', theme })
      page.lastSteps = steps
      await page.open(page.lastUrl, size)
      await page.until(`Boolean(document.querySelector('[data-top-row]'))`)
      for (const step of steps) await page.evaluate(step)
      await shoot(name)
    }
    await visit('home', [])
    for (const tab of TABS.slice(1, -1)) await visit(`tab-${slug(tab)}`, [click(tab, 'document.querySelector("[data-top-row]")')])
    for (const tab of SETTINGS) await visit(`settings-${slug(tab)}`, [click('Settings', 'document.querySelector("[data-top-row]")'), click(tab)])
  }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

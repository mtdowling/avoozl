#!/usr/bin/env node
// Full-app screenshots at 1280x800 of the Specs page that does not scroll:
// the list alone, a spec's Overview scrolled down (tab bar fixed), and a
// document tab with its inline comments scrolled; light and dark.
//   node test/browser/specs-scroll-shots.mjs <out dir>
import path from 'node:path'
import { click, startShots } from './shots.mjs'

const { out, harness, browser } = await startShots('specs-scroll-shots.mjs <out dir>')
const scroll = (selector, to) => `document.querySelector(${JSON.stringify(selector)}).scrollTop = ${to}`
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  for (const theme of ['light', 'dark'])
    for (const name of ['list', 'overview', 'document']) {
      await page.open(harness.url({ page: 'app', basic: '1', specs: '1', review: '1', theme }), { width: 1280, height: 800, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-top-row] [data-nav-head]'))`, 30000)
      await page.evaluate(`[...document.querySelectorAll('[data-top-row] [data-nav-head]')].find((t) => t.textContent.includes('Specs')).click()`)
      await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
      if (name !== 'list') {
        await page.evaluate(click('[data-plan-row="spec:byte-types"]'))
        await page.until(`Boolean(document.querySelector('[data-spec-tab]'))`, 30000)
        await settle()
      }
      if (name === 'overview') await page.evaluate(scroll('[data-spec-body]', 380))
      if (name === 'document') {
        await page.evaluate(click('[data-spec-tab="requirements.md"]'))
        await page.until(`Boolean(document.querySelector('[data-finding-card]'))`, 30000)
        await settle()
        await page.evaluate(scroll('[data-spec-body]', 300))
      }
      await settle()
      const file = path.join(out, `${name}-1280x800-${theme}.png`)
      await page.screenshot(file)
      console.log(file)
    }
} finally {
  await browser.close()
  harness.remove()
}

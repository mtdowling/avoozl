#!/usr/bin/env node
// Full-app screenshots of a spec's page (&review=1), one per tab: Overview
// (also while the AI working box shows), Tasks, and each document with its
// inline review comments (requirements also with Blocker and Warn on, and
// with the comments hidden); 1280 and 390 px, light and dark.
//   node test/browser/spec-tabs-shots.mjs <out dir>
import path from 'node:path'
import { click, openSpecs, startShots } from './shots.mjs'

const { out, harness, browser } = await startShots('spec-tabs-shots.mjs <out dir>')
try {
  const page = await browser.page()
  const settle = () => page.evaluate('new Promise((r) => setTimeout(r, 400))')
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark'])
      for (const name of ['overview-working', 'overview', 'tasks', 'requirements', 'design', 'tasks-md', 'requirements-filters', 'requirements-hidden']) {
        const url = harness.url({ page: 'app', basic: '1', specs: '1', review: '1', theme, ...(name === 'overview-working' ? { summary: 'running' } : {}) })
        await page.open(url, { width, height: width > 400 ? 1300 : 2200, dark: theme === 'dark' })
        await openSpecs(page, width, settle)
        await page.until(`Boolean(document.querySelector('[data-spec-summary]'))`, 30000)
        await page.until(`Boolean(document.querySelector('[data-spec-graph] [data-frontier]'))`, 30000)
        const tab = {
          tasks: 'tasks',
          requirements: 'requirements.md',
          design: 'design.md',
          'tasks-md': 'tasks.md',
          'requirements-filters': 'requirements.md',
          'requirements-hidden': 'requirements.md',
        }[name]
        if (tab) {
          await page.evaluate(click(`[data-spec-tab="${tab}"]`))
          await settle()
        }
        if (name === 'requirements-filters') {
          await page.until(`Boolean(document.querySelector('[data-severity-filter="blocker"]'))`, 30000)
          await page.evaluate(click('[data-severity-filter="blocker"]'))
          await page.evaluate(click('[data-severity-filter="warn"]'))
          await settle()
        }
        if (name === 'requirements-hidden') {
          await page.until(`Boolean(document.querySelector('[data-comments-toggle]'))`, 30000)
          await page.evaluate(click('[data-comments-toggle]'))
          await settle()
          await page.evaluate(`localStorage.removeItem('avoozl:review-comments-hidden')`)
        }
        await settle()
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
} finally {
  await browser.close()
  harness.remove()
}

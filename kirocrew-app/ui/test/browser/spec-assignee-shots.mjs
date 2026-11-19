#!/usr/bin/env node
// Screenshots of who has each spec (R116.11, design §4.44) in the full app
// on demo data with fake driver rows, desktop 1280 and phone 390, light and
// dark:
//   list-<width>-<theme>.png      the Specs list, one row per driver state
//   taken-<width>-<theme>.png     Meal planner, taken by octocat: the banner
//   handoff-<width>-<theme>.png   Recipe import, driven here: Hand off with Release
//
//   AVOOZL_HOST_CSS=<host css> node test/browser/spec-assignee-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness, shotCss } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'
import { demoReplies, demoScript } from './demo-replies.mjs'
import { demoHelpers } from './shots.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: spec-assignee-shots.mjs <out dir>')
  process.exit(2)
}
const chrome = findChrome()
if (!chrome) {
  console.error('No Chrome found; set AVOOZL_CHROME.')
  process.exit(1)
}
fs.mkdirSync(out, { recursive: true })

// One driver row per state, in the shapes plan.table and driver.status give.
const seen = new Date(Date.now() - 4 * 60000).toISOString()
const drivers = {
  'recipe-import': { state: 'driver', reason: 'driver', assignees: ['you'], text: 'This workspace drives it.' },
  'meal-planner': {
    state: 'read-only',
    reason: 'other-person',
    assignees: ['octocat'],
    text: 'Taken by octocat: its spec issue is assigned to them.',
    driver: { login: 'octocat', label: 'laptop', machine: 'mch_7hw2c4n6r8t1y3pq' },
  },
  'recipe-box': { state: 'read-only', reason: 'no-assignee', assignees: [], text: 'Nobody drives it. Take over assigns you on its spec issue.' },
  'shopping-list': {
    state: 'read-only',
    reason: 'several',
    assignees: ['octocat', 'hubot'],
    text: 'Its spec issue has several assignees: octocat, hubot. Remove all but one on GitHub.',
  },
}
const sample = await demoReplies()
for (const row of sample.replies['plan.table'].items) {
  const driver = drivers[row.planId]
  if (driver) row.driver = { mode: 'github', state: driver.state, reason: driver.reason, assignees: driver.assignees }
}
sample.replies['driver.status'] = {
  enabled: true,
  machine: { id: 'mch_aaaaaaaaaaaaaaaa', label: 'desk', heartbeatMinutes: null },
  readOnly: 3,
  specs: Object.entries(drivers).map(([planId, driver], index) => ({
    planId,
    spec: planId,
    mode: 'github',
    state: driver.state,
    reason: driver.reason,
    you: driver.state === 'driver',
    text: driver.text,
    issue: { number: 40 + index, url: `https://github.com/example/specs/issues/${40 + index}` },
    assignees: driver.assignees,
    decidedBy: 'plan',
    driver: driver.driver ?? null,
    offer: driver.state === 'driver' ? 'handoff' : driver.reason === 'other-person' ? 'force' : 'takeover',
    seenAt: driver.driver ? seen : null,
    stale: false,
    decision: null,
    handoff: null,
    away: [],
    setup: [],
  })),
}

const harness = await buildHarness({ hostCss: await shotCss(), scripts: { 'demo.js': demoScript(sample) } })
const browser = await launch(chrome)
try {
  const page = await browser.page()
  const { wait, click, button, openDemoSpecs } = demoHelpers(page)
  const list = `document.querySelector('[data-plans-list]')`
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark']) {
      const dark = theme === 'dark'
      const url = harness.url({ page: 'demo', theme })
      const start = async () => {
        await openDemoSpecs(url, width, dark)
        await page.until(`Boolean(document.querySelector('[data-plans-list] [data-spec-driver]'))`)
        await wait(500)
      }
      await start()
      await page.screenshot(path.join(out, `list-${width}-${theme}.png`))
      await click(button('Meal planner', list))
      await page.until(`Boolean(document.querySelector('[data-driver-banner]'))`)
      await wait(600)
      await page.evaluate(`document.querySelector('[data-driver-banner]').scrollIntoView({ block: 'center' })`)
      await wait(200)
      await page.screenshot(path.join(out, `taken-${width}-${theme}.png`))
      await start()
      await click(button('Recipe import', list))
      await page.until(`Boolean(document.querySelector('[data-driver-chip]'))`)
      await wait(400)
      // Hand off driver sits in the spec's actions; on a phone it may be
      // in the More menu.
      const handoff = button('Hand off driver')
      if (!(await page.evaluate(`Boolean(${handoff})`))) await click(`document.querySelector('[data-spec-more] [data-more-button]')`)
      await page.until(`Boolean(${handoff})`)
      await click(handoff)
      await page.until(`Boolean(document.querySelector('[data-driver-handoff]'))`)
      await wait(400)
      await page.screenshot(path.join(out, `handoff-${width}-${theme}.png`))
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

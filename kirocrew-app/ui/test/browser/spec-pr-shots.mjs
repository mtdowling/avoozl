#!/usr/bin/env node
// Full-app screenshots of spec pull request adoption (R107), 1280 and 390
// px, light and dark: <out>/<name>-<width>-<theme>.png.
//   list       Specs list with the PR chip
//   overview   a spec's Overview with the Proposed change box
//   draft      the same for a draft pull request (Approve held back)
//   approved   the Approve dialog after Approve: Avoozl merges it
//   decision   Needs you > Decisions with the pull request's item open
//   triage     Needs you > Triage with Review as spec on a spec-only pull request
//
//   node test/browser/spec-pr-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: spec-pr-shots.mjs <out dir>')
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
const click = (selector) => `document.querySelector(${JSON.stringify(selector)}).click()`
try {
  const page = await browser.page()
  const settle = (ms = 500) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
  for (const width of [1280, 390])
    for (const theme of ['light', 'dark'])
      for (const name of ['list', 'overview', 'draft', 'approved', 'decision', 'triage']) {
        const specpr = name === 'draft' ? 'draft' : '1'
        await page.open(harness.url({ page: 'app', specs: '1', review: '1', specpr, theme }), { width, height: width > 400 ? 1100 : 1900, dark: theme === 'dark' })
        await page.until(`Boolean(document.querySelector('[data-top-row], [data-top-rail-bar]'))`, 30000)
        const phone = width < 768
        const nav = async (group, item) => {
          if (phone) {
            if (!(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(click('[data-top-rail-bar]'))
            await settle(300)
          }
          const scope = phone ? '[data-top-rail-list]' : 'body'
          await page.evaluate(
            `(() => { const h = [...document.querySelectorAll('${scope} [data-nav-head]')].find((t) => t.textContent.includes(${JSON.stringify(group)})); if (h && (${JSON.stringify(!item)} || !h.hasAttribute('data-open'))) h.click() })()`,
          )
          await settle(300)
          if (item)
            await page.evaluate(
              `[...document.querySelectorAll('${scope} [data-nav-item]:not([data-nav-head])')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(item)}))?.click()`,
            )
          await settle(300)
          if (phone && (await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`))) await page.evaluate(click('[data-top-rail-bar]'))
        }
        if (name === 'decision' || name === 'triage') {
          await nav('Needs you', name === 'decision' ? 'Decisions' : 'Triage')
          if (name === 'decision') {
            await settle(600)
            await page.evaluate(
              `(() => { const el = [...document.querySelectorAll('[data-shell-main] *')].filter((e) => e.children.length === 0 && e.textContent.includes('Proposed change to byte-types')).at(0); el?.click() })()`,
            )
            await page.until(`Boolean(document.querySelector('[data-spec-pull]'))`, 30000)
          } else await page.until(`Boolean(document.querySelector('[data-untriaged-table], [data-untriaged-stack]'))`, 30000)
        } else {
          await nav('Specs')
          await page.until(`Boolean(document.querySelector('[data-plan-row="spec:byte-types"]'))`, 30000)
          if (name !== 'list') {
            await page.evaluate(click('[data-plan-row="spec:byte-types"]'))
            await page.until(`Boolean(document.querySelector('[data-spec-pull]'))`, 30000)
          }
          if (name === 'approved') {
            await page.evaluate(click('[data-spec-pull-approve]'))
            await page.until(`Boolean(document.querySelector('[data-approve-spec-go]'))`, 30000)
            await page.evaluate(click('[data-approve-spec-go]'))
            await page.until(`Boolean(document.querySelector('[data-spec-pull-approved]'))`, 30000)
          }
        }
        await settle(700)
        const file = path.join(out, `${name}-${width}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

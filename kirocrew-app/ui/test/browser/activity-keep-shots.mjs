#!/usr/bin/env node
// Screenshots of Activity > Keep activity in the full app shell: the field
// after a typed value has auto-saved ("Saved") and with an invalid value,
// at desktop and phone width, light and dark: <out>/<state>-<size>-<theme>.png.
//
//   node test/browser/activity-keep-shots.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { buildHarness } from './build.mjs'
import { findChrome, launch } from './chrome.mjs'

const [out] = process.argv.slice(2)
if (!out) {
  console.error('Usage: activity-keep-shots.mjs <out dir>')
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
const SIZES = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } }
const type = (value) =>
  `(() => { const i = document.getElementById('avoozl-activity-keep'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
const scrollDown = `(() => { for (let e = document.getElementById('avoozl-activity-keep'); e; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; return true })()`
const sleep = (ms) => `new Promise((r) => setTimeout(r, ${ms}))`
try {
  const page = await browser.page()
  for (const [size, box] of Object.entries(SIZES))
    for (const theme of ['light', 'dark']) {
      await page.open(harness.url({ page: 'app', radar: '1', activity: '1', theme }), { ...box, dark: theme === 'dark' })
      await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
      await page.evaluate(sleep(1200))
      // The nav's scope: the left nav on a desktop, the open menu on a phone.
      const scope = box.width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
      if (box.width < 768 && !(await page.evaluate(`Boolean(document.querySelector('[data-top-rail-list]'))`)))
        await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
      await page.evaluate(sleep(200))
      await page.evaluate(
        `(() => { const b = [...document.querySelectorAll('${scope} [data-nav-head]')].find((x) => x.textContent.includes('Activity')); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`,
      )
      await page.until(`Boolean(document.getElementById('avoozl-activity-keep') && !document.getElementById('avoozl-activity-keep').disabled)`)
      const shoot = async (state) => {
        await page.evaluate(scrollDown)
        await page.evaluate(sleep(300))
        await page.evaluate(scrollDown)
        await page.evaluate(sleep(300))
        const file = path.join(out, `${state}-${size}-${theme}.png`)
        await page.screenshot(file)
        console.log(file)
      }
      await page.until(`Boolean(document.getElementById('avoozl-activity-keep'))`)
      await page.evaluate(
        `(() => { for (let e = document.getElementById('avoozl-activity-keep'); e; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible') return true })()`,
      )
      await page.evaluate(type('14'))
      await page.evaluate(sleep(300))
      const early = await page.evaluate(`document.querySelector('[data-activity-keep]').textContent`)
      await page.evaluate(sleep(1200))
      await shoot('saved')
      console.log(
        size,
        theme,
        'after 300 ms:',
        JSON.stringify(early),
        'after 1.5 s:',
        JSON.stringify(await page.evaluate(`document.querySelector('[data-activity-keep]').textContent`)),
      )
      await page.evaluate(type('500'))
      await page.evaluate(sleep(1200))
      await shoot('invalid')
      console.log(
        await page.evaluate(
          `(() => { const e = document.getElementById('avoozl-activity-keep-error'); const r = e.getBoundingClientRect(); const c = getComputedStyle(e); const i = document.getElementById('avoozl-activity-keep').getBoundingClientRect(); return JSON.stringify([i.y, i.height, r.x, r.y, r.width, r.height, c.color, c.display, c.visibility, c.opacity]) })()`,
        ),
      )
      console.log(
        size,
        theme,
        'invalid:',
        JSON.stringify(await page.evaluate(`document.querySelector('[data-activity-keep]').textContent`)),
        'save buttons:',
        await page.evaluate(`[...document.querySelectorAll('[data-activity-keep] button')].length`),
      )
    }
  if (page.errors.length) console.error(page.errors.join('\n'))
} finally {
  await browser.close()
  harness.remove()
}

// Settings > Workspaces > Telemetry (spec otel-export, OT11): each status
// shows its words, the switch calls telemetry.configure, and the box never
// holds a header value or a URL path. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildHarness } from './browser/build.mjs'
import { findChrome, launch } from './browser/chrome.mjs'

const chrome = findChrome()
const skip = chrome ? false : 'no Chrome found; set AVOOZL_CHROME to run the Telemetry settings tests'

let harness, browser, page
before(async () => {
  if (skip) return
  harness = await buildHarness()
  browser = await launch(chrome)
  page = await browser.page()
})
after(async () => {
  await browser?.close()
  harness?.remove()
})

const wait = (ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const click = (selector, text) =>
  `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) b.click(); return Boolean(b) })()`

async function openBox(status, width = 1280) {
  await page.open(harness.url({ page: 'app', basic: '1', inline: '1', telemetry: status }), { width, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(200)
  assert.ok(await page.evaluate(click(`${scope} [data-nav-head]`, 'Settings')), 'Settings')
  await wait(300)
  await page.until(`Boolean(document.querySelector('[data-telemetry]'))`)
}
const text = (name) => page.evaluate(`document.querySelector('[data-telemetry-value="${name}"]')?.textContent ?? null`)

for (const [status, words] of [
  ['off', 'Off'],
  ['no-endpoint', 'Waiting for an endpoint'],
  ['protocol', 'Protocol not supported'],
  ['endpoint-not-allowed', 'Endpoint not allowed'],
  ['sending', 'Sending'],
  ['backing-off', 'Backing off (http 503)'],
])
  test(`the Telemetry box shows ${status} as "${words}"`, { skip }, async () => {
    await openBox(status)
    assert.equal(await text('status'), words)
    const box = await page.evaluate(`document.querySelector('[data-field-box="Telemetry"]').textContent`)
    assert.match(box, /OTEL_EXPORTER_OTLP_\*/)
    assert.doesNotMatch(box, /Bearer|v1\/traces|secret/)
    if (status === 'sending') {
      assert.equal(await text('endpoint'), 'https://otlp.example:4318')
      assert.equal(await text('headers'), 'authorization')
      assert.equal(await text('sent'), '41')
      assert.equal(await text('local'), '5120 spans, 48210 points')
    }
  })

test('the switch calls telemetry.configure and the box follows', { skip }, async () => {
  await openBox('off')
  assert.ok(await page.evaluate(`(() => { const t = document.querySelector('[data-telemetry-switch] [role="switch"]'); if (t) t.click(); return Boolean(t) })()`))
  await page.until(`document.querySelector('[data-telemetry-value="status"]')?.textContent === 'Waiting for an endpoint'`)
  assert.ok(await page.evaluate(`document.querySelector('[data-telemetry-switch] [role="switch"]').getAttribute('aria-checked') === 'true'`))
})

test('the box fits a phone', { skip }, async () => {
  await openBox('backing-off', 390)
  const wide = await page.evaluate(`document.documentElement.scrollWidth > document.documentElement.clientWidth`)
  assert.equal(wide, false, 'no sideways scroll at 390 px')
})

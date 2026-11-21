// Settings > Workspaces > Telemetry (spec otel-export, OT11): the local store
// row comes first, each status shows its words, the Set up export dialog
// saves through telemetry.configure, and the box never holds a header value
// or a URL path. Skipped when no Chrome is found.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { harnessPage } from './browser/harness-page.ts'
import { clickText } from './browser/picker-steps.ts'

const state = harnessPage('Telemetry settings')
const skip = state.skip

const wait = (ms: number) => state.page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)
const type = (id: string, value: string) =>
  `(() => { const i = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`

async function openBox(status: string, width = 1280) {
  const { page, harness } = state
  await page.open(harness.url({ page: 'app', basic: '1', inline: '1', telemetry: status }), { width, height: 900 })
  await page.until(`Boolean(document.querySelector('[data-shell-main]'))`)
  const scope = width < 768 ? '[data-top-rail-list]' : '[data-left-nav]'
  if (width < 768) await page.evaluate(`document.querySelector('[data-top-rail-bar]').click()`)
  await wait(200)
  assert.ok(await page.evaluate(clickText(`${scope} [data-nav-head]`, 'Settings')), 'Settings')
  await wait(300)
  await page.until(`Boolean(document.querySelector('[data-telemetry]'))`)
}
const text = (name: string) => state.page.evaluate<string | null>(`document.querySelector('[data-telemetry-value="${name}"]')?.textContent ?? null`)

for (const [status, words] of [
  ['off', 'Recording locally · export off'],
  ['no-endpoint', 'Recording locally · export waiting for an endpoint'],
  ['protocol', 'Recording locally · export protocol not supported'],
  ['endpoint-not-allowed', 'Recording locally · export endpoint not allowed'],
  ['sending', 'Recording locally · exporting'],
  ['backing-off', 'Recording locally · export backing off (http 503)'],
])
  test(`the Telemetry box shows ${status} as "${words}"`, { skip }, async () => {
    const { page } = state
    await openBox(status)
    assert.equal(await text('status'), words)
    assert.match((await text('local')) ?? '', /^On, always · 5,120 spans, 48,210 points · kept 90 days/)
    const first = await page.evaluate(`document.querySelector('[data-telemetry] [data-telemetry-value]').dataset.telemetryValue`)
    assert.equal(first, 'local', 'the local store row comes first')
    const box = await page.evaluate<string>(`document.querySelector('[data-field-box="Telemetry"]').textContent`)
    assert.match(box, /OTEL_EXPORTER_OTLP_\*/)
    assert.doesNotMatch(box, /Bearer|v1\/traces|secret|OpenTelemetry/)
    if (status === 'sending') {
      assert.equal(await text('endpoint'), 'https://otlp.example:4318 (saved here)')
      assert.equal(await text('headers'), 'authorization (value from OTEL_EXPORTER_OTLP_HEADERS)')
      assert.equal(await text('sent'), '41')
    }
    if (status === 'off') assert.equal(await text('sent'), null, 'no export counts while export is off')
  })

test('Set up export walks three steps and saves through telemetry.configure', { skip }, async () => {
  const { page } = state
  await openBox('off')
  assert.ok(await page.evaluate(clickText('[data-telemetry] button, [data-field-box="Telemetry"] button', 'Set up export')))
  await page.until(`document.querySelector('[data-telemetry-dialog]')?.dataset.telemetryDialog === '0'`)
  assert.ok(await page.evaluate(`Boolean(document.querySelector('[data-telemetry-step="recorded"]'))`))
  assert.ok(await page.evaluate(clickText('dialog button', 'Next')))
  await page.until(`Boolean(document.querySelector('[data-telemetry-step="export"]'))`)
  await page.evaluate(`document.querySelector('[data-telemetry-export-switch] [role="switch"]').click()`)
  await page.evaluate(type('avoozl-telemetry-headers', 'authorization=Bearer x'))
  await page.until(`document.querySelector('[data-telemetry-step="export"] [role="alert"]')?.textContent.includes('names only')`)
  await page.evaluate(type('avoozl-telemetry-headers', 'authorization'))
  await page.evaluate(type('avoozl-telemetry-endpoint', 'https://otlp.example:4318'))
  await wait(100)
  assert.ok(await page.evaluate(clickText('dialog button', 'Next')))
  await page.until(`Boolean(document.querySelector('[data-telemetry-step="review"]'))`)
  assert.equal(await text('review-export'), 'On')
  assert.equal(await text('review-endpoint'), 'https://otlp.example:4318')
  assert.ok(await page.evaluate(clickText('dialog button', 'Save')))
  await page.until(`!document.querySelector('[data-telemetry-dialog]')`)
  await page.until(`document.querySelector('[data-telemetry-value="status"]')?.textContent === 'Recording locally · exporting'`)
  assert.equal(await text('headers'), 'authorization (value from OTEL_EXPORTER_OTLP_HEADERS)')
})

test('the box fits a phone', { skip }, async () => {
  const { page } = state
  await openBox('backing-off', 390)
  const wide = await page.evaluate(`document.documentElement.scrollWidth > document.documentElement.clientWidth`)
  assert.equal(wide, false, 'no sideways scroll at 390 px')
})

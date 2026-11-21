// @ts-nocheck: typing debt
// The Telemetry box's words, checks and operations (spec otel-export, OT11).
import assert from 'node:assert/strict'
import test from 'node:test'
import { ENVIRONMENT_NOTE, endpointProblem, formOf, headerNames, lastSuccess, localWords, statusWords, telemetryClient } from '../src/telemetry-api.ts'

test('each status leads with local recording and shows its own words', () => {
  const words = Object.fromEntries(
    ['off', 'no-endpoint', 'protocol', 'endpoint-not-allowed', 'bad-headers', 'missing-headers', 'ready', 'sending'].map((status) => [
      status,
      statusWords({ status, failure: null }),
    ]),
  )
  assert.equal(words.off, 'Recording locally · export off')
  assert.equal(words['no-endpoint'], 'Recording locally · export waiting for an endpoint')
  assert.equal(words.sending, 'Recording locally · exporting')
  for (const value of Object.values(words)) assert.match(value, /^Recording locally · /)
  assert.equal(new Set(Object.values(words)).size, 8)
})

test('backing off names the failure kind and nothing else', () => {
  for (const failure of ['timeout', 'refused', 'tls', 'dns', 'http 503', 'http 302'])
    assert.equal(statusWords({ status: 'backing-off', failure }), `Recording locally · export backing off (${failure})`)
  for (const failure of [null, 'https://x.example/v1/traces', 'Bearer abc'])
    assert.equal(statusWords({ status: 'backing-off', failure }), 'Recording locally · export backing off (error)')
})

test('the local row says on, always, with the counts, the days and the caps', () => {
  assert.equal(
    localWords({ spans: 5120, points: 48210, days: 90, spanCap: 200000, pointCap: 1000000 }),
    'On, always · 5,120 spans, 48,210 points · kept 90 days, at most 200,000 spans and 1,000,000 points',
  )
})

test('the note says the environment wins and where header values come from', () => {
  assert.match(ENVIRONMENT_NOTE, /OTEL_EXPORTER_OTLP_\*/)
  assert.match(ENVIRONMENT_NOTE, /OTEL_EXPORTER_OTLP_HEADERS/)
  assert.match(ENVIRONMENT_NOTE, /desktop app/)
  assert.equal(lastSuccess(null), 'Never')
})

test('header names refuse a value, and the endpoint check matches the server', () => {
  assert.deepEqual(headerNames('authorization, x-team authorization'), { names: ['authorization', 'x-team'] })
  assert.deepEqual(headerNames(''), { names: [] })
  for (const text of ['authorization=Bearer x', 'authorization: Bearer x']) assert.match(headerNames(text).error ?? '', /names only/)
  for (const ok of ['', 'https://c.example:4318', 'http://localhost:4318', 'https://c.example/otlp']) assert.equal(endpointProblem(ok), null, ok)
  for (const bad of ['c.example', 'http://c.example', 'https://u:p@c.example', 'https://c.example/?k=1']) assert.ok(endpointProblem(bad), bad)
})

test('the form starts from what is saved', () => {
  const view = { status: 'sending', saved: { endpoint: 'https://c.example', protocol: 'http/json', headers: ['authorization'] } }
  assert.deepEqual(formOf(view), { enabled: true, endpoint: 'https://c.example', protocol: 'http/json', headers: ['authorization'] })
  assert.equal(formOf({ ...view, status: 'off', saved: { endpoint: null, protocol: 'http/json', headers: [] } }).endpoint, '')
})

test('save calls telemetry.configure with the form and the box reads telemetry.status', async () => {
  const calls = []
  const api = { post: async (path, body) => (calls.push([body.operation, body.input]), { result: {} }) }
  const client = telemetryClient(api)
  await client.status('w')
  const input = { enabled: true, endpoint: 'https://c.example', protocol: 'http/json', headers: ['authorization'] }
  await client.configure('w', input)
  assert.deepEqual(calls, [
    ['telemetry.status', {}],
    ['telemetry.configure', input],
  ])
})

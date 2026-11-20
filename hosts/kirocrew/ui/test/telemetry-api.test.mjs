// The Telemetry box's words and operations (spec otel-export, OT11.2, OT11.6).
import assert from 'node:assert/strict'
import test from 'node:test'
import { ENVIRONMENT_NOTE, lastSuccess, statusWords, telemetryClient } from '../src/telemetry-api.ts'

test('each status shows its words', () => {
  const words = Object.fromEntries(
    ['off', 'no-endpoint', 'protocol', 'endpoint-not-allowed', 'bad-headers', 'ready', 'sending'].map((status) => [status, statusWords({ status, failure: null })]),
  )
  assert.equal(words.off, 'Off')
  assert.equal(words['no-endpoint'], 'Waiting for an endpoint')
  assert.equal(words.protocol, 'Protocol not supported')
  assert.equal(words['endpoint-not-allowed'], 'Endpoint not allowed')
  assert.equal(words.sending, 'Sending')
  assert.equal(new Set(Object.values(words)).size, 7)
})

test('backing off names the failure kind and nothing else', () => {
  for (const failure of ['timeout', 'refused', 'tls', 'dns', 'http 503', 'http 302']) assert.equal(statusWords({ status: 'backing-off', failure }), `Backing off (${failure})`)
  for (const failure of [null, 'https://x.example/v1/traces', 'Bearer abc']) assert.equal(statusWords({ status: 'backing-off', failure }), 'Backing off (error)')
})

test('the box says where the endpoint comes from, and a missing success reads Never', () => {
  assert.match(ENVIRONMENT_NOTE, /OTEL_EXPORTER_OTLP_\*/)
  assert.match(ENVIRONMENT_NOTE, /desktop app/)
  assert.equal(lastSuccess(null), 'Never')
})

test('the switch calls telemetry.configure and the box reads telemetry.status', async () => {
  const calls = []
  const api = { post: async (path, body) => (calls.push([body.operation, body.input]), { result: {} }) }
  const client = telemetryClient(api)
  await client.status('w')
  await client.configure('w', true)
  assert.deepEqual(calls, [
    ['telemetry.status', {}],
    ['telemetry.configure', { enabled: true }],
  ])
})

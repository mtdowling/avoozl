// Settings > Delivery: who merges (read for Radar pull requests too), and the
// writer settings; and how sessions label their crew.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { toDeliveryForm, toDeliverySection } from '../src/delivery-api.ts'
import { sessionLabel } from '../src/views-api.ts'
import { attachHref } from '../src/task-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('Settings > Delivery holds investigate first, with defaults left unset; the writer model is in Models', () => {
  assert.deepEqual(toDeliverySection(toDeliveryForm({})), { delivery: {} })
  const page = source('DeliverySettings.tsx')
  // Pull request feedback went with per-task issues (45.4).
  for (const raw of ['delivery.prFeedback', 'delivery.feedbackRounds', 'delivery.model', 'delivery.agent']) assert.ok(!page.includes(raw), raw)
  assert.match(source('SettingsView.tsx'), /key: 'delivery', label: 'Delivery'/)
  // Investigate first (§4.21): defaults stay unset.
  const form = toDeliveryForm({ investigate: { mode: 'off' } })
  assert.deepEqual(toDeliverySection(form), { delivery: { investigate: { mode: 'off' } } })
  assert.deepEqual(toDeliverySection({ ...form, investigateMode: 'not-small' }), { delivery: {} })
  // Who merges is the repository's Landing tab (§4.25), never delivery.
  assert.ok(page.includes('delivery.investigate.mode'))
  assert.doesNotMatch(page, /delivery\.ship|Who merges/)
})

test('sessions show crew, agent, and an unreachable crew; a remote chat attaches only through MC-10', () => {
  assert.equal(
    sessionLabel({ slot: 's', role: 'worker', attempt: 1, status: 'idle', crew: 'fake-linux', agent: 'alt-worker', model: 'model-a', crewUnreachable: true }),
    'worker #1 · crew unreachable · on fake-linux · alt-worker · model-a',
  )
  assert.equal(attachHref({ slot: 's1', crew: 'fake-linux', link: null }), null)
  assert.equal(attachHref({ slot: 's1', crew: 'local', link: null }), '/chat?sid=s1')
  assert.equal(attachHref({ slot: 's1', crew: 'fake-linux', link: '/crews/fake-linux/chat?sid=s1' }), '/crews/fake-linux/chat?sid=s1')
})

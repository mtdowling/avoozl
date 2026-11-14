// Settings > Delivery: who merges (read for Radar pull requests too), and the
// writer settings; and how sessions label their crew. Kept from the retired
// Routing page's tests, which also covered these.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { toDeliveryForm, toDeliverySection } from '../src/delivery-api.ts'
import { sessionLabel } from '../src/views-api.ts'
import { attachHref } from '../src/task-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('Settings > Delivery holds PR feedback, who merges and the writer model, with defaults as placeholders', () => {
  assert.deepEqual(toDeliverySection(toDeliveryForm({})), { delivery: {} })
  assert.deepEqual(toDeliverySection({ agent: '', model: 'model-a', prFeedback: 'off', feedbackRounds: '3' }), { delivery: { model: 'model-a', prFeedback: false, feedbackRounds: 3 } })
  assert.match(toDeliverySection({ agent: '', model: '', prFeedback: '', feedbackRounds: '21' }).error, /1–20/)
  const page = source('DeliverySettings.tsx')
  for (const raw of ['delivery.prFeedback', 'delivery.feedbackRounds', 'delivery.model', 'delivery.agent']) assert.ok(page.includes(raw), raw)
  assert.match(page, /placeholder=\{String\(DELIVERY_DEFAULTS\.feedbackRounds\)\}/)
  assert.doesNotMatch(page, /Routing/)
  assert.match(source('SettingsView.tsx'), /key: 'delivery', label: 'Delivery'/)
  // Ship mode and investigate first (§4.25, §4.21): defaults stay unset.
  const form = toDeliveryForm({ ship: 'manual', investigate: { mode: 'off', agent: 'alt' } })
  assert.equal(form.ship, 'manual')
  assert.deepEqual(toDeliverySection(form), { delivery: { ship: 'manual', investigate: { mode: 'off', agent: 'alt' } } })
  assert.deepEqual(toDeliverySection({ ...form, ship: 'auto-merge', investigateMode: 'not-small' }), { delivery: { investigate: { agent: 'alt' } } })
  for (const raw of ['delivery.ship', 'delivery.investigate.mode', 'RadioFold']) assert.ok(page.includes(raw), raw)
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

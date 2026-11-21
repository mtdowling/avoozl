// @ts-nocheck: typing debt
// Settings > Autopilot: who delivers, who merges (the workspace's landing.pr); and how
// sessions label their crew.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { sessionLabel } from '../src/views-api.ts'
import { attachHref } from '../src/task-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('Settings > Autopilot holds the Off/Autopilot picker and the workspace landing.pr; the writer model is in Models', () => {
  const page = source('DeliverySettings.tsx')
  // Pull request feedback went with per-task issues (45.4).
  for (const raw of ['delivery.prFeedback', 'delivery.feedbackRounds', 'delivery.model', 'delivery.agent']) assert.ok(!page.includes(raw), raw)
  assert.match(source('SettingsView.tsx'), /key: 'delivery', label: 'Autopilot'/)
  // Who merges is the workspace's landing.pr here (R119); a repository's
  // Landing tab may override it. It is never a delivery key.
  assert.doesNotMatch(page, /delivery\.investigate/)
  assert.match(page, /landingPr: pr/)
  assert.doesNotMatch(page, /delivery\.ship|autoMerge/)
  // Every setting shows while off: no early return hides Who merges.
  assert.doesNotMatch(page, /if \(!value\.on\)\s*return/)
  // Each change of mode asks first.
  assert.match(page, /if \(!\(await confirm\(CONFIRM\[next\]\)\)\) return/)
})

test('no label on Settings > Autopilot says Delivery', () => {
  const page = source('DeliverySettings.tsx')
  // Quoted text only: names in code (delivery.settings.update) stay.
  for (const text of page.match(/'[^']*'|`[^`]*`|>[^<>{}]+</g) ?? []) assert.doesNotMatch(text, /\bDelivery\b|\bdelivery is\b|Turn on delivery/, text)
  assert.doesNotMatch(source('SettingsView.tsx'), /label: 'Delivery'/)
  assert.doesNotMatch(source('LandingFields.tsx'), /Settings › Delivery/)
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

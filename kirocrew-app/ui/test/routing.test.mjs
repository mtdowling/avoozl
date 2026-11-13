// The Routing page (design §8.3, R42, R53.11) and Settings > Delivery
// (R53.3, R54.8): pure helpers and how the page wires them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MC10_LINE,
  OFF_LINE,
  RELAY_AGENT,
  RELAY_CATCHES,
  relayLines,
  chatPlaceholder,
  checkText,
  crewMap,
  insertExample,
  readingText,
  toCrewEntry,
  toCrewForm,
  toProviderBox,
  toRoutingSection,
  usedText,
} from '../src/routing-api.ts'
import { toDeliveryForm, toDeliverySection } from '../src/delivery-api.ts'
import { sessionLabel } from '../src/views-api.ts'
import { attachHref } from '../src/task-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('the routing prompt saves on, off, and an inserted example, never twice', () => {
  assert.equal(insertExample('', { text: 'Tests go remote.' }), 'Tests go remote.')
  assert.equal(insertExample('Keep it local.\n', { text: 'Tests go remote.' }), 'Keep it local.\nTests go remote.')
  assert.equal(insertExample('Tests go remote.', { text: 'Tests go remote.' }), 'Tests go remote.')
  assert.deepEqual(toRoutingSection({ enabled: true, prompt: ' Spread the load. ', model: '' }).routing, { enabled: true, prompt: 'Spread the load.' })
  assert.deepEqual(toRoutingSection({ enabled: false, prompt: '', model: 'model-r' }).routing, { model: 'model-r' })
  assert.match(toRoutingSection({ enabled: true, prompt: '  ', model: '' }).error, /Write a routing prompt/)
  assert.match(toRoutingSection({ enabled: false, prompt: 'x'.repeat(4001), model: '' }).error, /at most 4000/)
  assert.match(OFF_LINE, /every task runs on this machine/)
})

test('the provider box saves one low line and credits limits, keeping token limits', () => {
  assert.deepEqual(toProviderBox({ lowPercent: '', limits: {} }).providers, {})
  assert.deepEqual(toProviderBox({ lowPercent: '70', limits: { claude: '500', kiro: '' } }, { kiro: { tokens: 9 } }).providers, {
    lowPercent: 70,
    limits: { kiro: { tokens: 9 }, claude: { credits: 500 } },
  })
  assert.match(toProviderBox({ lowPercent: '100', limits: {} }).error, /1–99/)
  assert.match(toProviderBox({ lowPercent: '', limits: { claude: '-1' } }).error, /claude/)
  assert.equal(usedText({ provider: 'claude', level: 'low', percent: 85, credits: 85, tokens: 0, limit: { credits: 100 }, why: 'usage', line: '' }), '85% used')
  assert.equal(usedText({ provider: 'kiro', level: 'ok', percent: null, credits: 0, tokens: 0, limit: null, why: null, line: '' }), 'no usage')
})

test('crew settings show defaults as placeholders and keep trust and hand-back', () => {
  const crew = { id: 'fake-linux', name: 'fake linux', tags: ['os:linux', 'trust:remote'], trust: 'remote', gitHosts: ['git.example.test'], chatLimit: 2, chatLimitSet: false, delivery: 'handback', sshHost: 'user@fake.example.test', worktreeRoot: '/w', configured: true, reading: null, ageSeconds: null, running: 0, checks: [{ check: 'online', ok: false, why: 'no reading' }] }
  assert.equal(chatPlaceholder(crew), '2')
  assert.equal(chatPlaceholder({ id: 'local' }), '3')
  const form = toCrewForm(crew)
  assert.equal(form.chatLimit, '')
  assert.deepEqual(toCrewEntry('fake-linux', form).entry, { tags: ['os:linux', 'trust:remote'], gitHosts: ['git.example.test'], delivery: 'handback', sshHost: 'user@fake.example.test', worktreeRoot: '/w' })
  assert.match(toCrewEntry('fake-linux', { ...form, tags: 'color:red' }).error, /use key:value/)
  assert.match(toCrewEntry('fake-linux', { ...form, worktreeRoot: 'relative' }).error, /absolute/)
  assert.deepEqual(Object.keys(crewMap([crew, { ...crew, id: 'other', configured: false }])), ['fake-linux'])
  assert.equal(readingText(crew).mem, '–')
  assert.equal(checkText(crew.checks[0]), 'no reading')
  assert.equal(checkText({ check: 'ready', ok: true, why: null }), 'yes')
})

test('Settings › Routing has its four sections in order, examples, and no rule builder', () => {
  const page = source('RoutingView.tsx')
  const order = ['title="Routing prompt"', 'title="Providers"', 'title="Crews"', 'title="Preview"'].map((s) => page.indexOf(s))
  assert.ok(order.every((at) => at > 0))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  for (const gone of ['title="Rules"', 'title="Smart pick"', 'title="Model router"', 'RuleDialog', 'Show weights']) assert.ok(!page.includes(gone), gone)
  assert.match(MC10_LINE, /wait on Kiro Crew \(MC-10\)/)
  assert.match(page, /\{MC10_LINE\}/)
  assert.match(page, /Saved on this machine only\./)
  assert.match(page, /props\.view\.examples\.map/)
  assert.match(page, /confirm=\{\{ title: `Remove settings for/)
  assert.match(page, /placeholder=\{String\(DEFAULT_STALE_SECONDS\)\}/)
  assert.match(page, /placeholder=\{String\(box\.defaultLowPercent\)\}/)
  assert.match(source('SettingsView.tsx'), /key: 'routing', label: 'Routing'/)
  assert.doesNotMatch(source('SettingsView.tsx'), /key: 'providers'/)
  assert.doesNotMatch(source('App.tsx'), /key: 'routing'/)
})

test('the Remote relay block shows the setting, both catches, the turn count, and a confirmed Forget', () => {
  const relay = { setting: 'on', active: true, ignored: false, slot: null, queued: 2, workers: 0, turnsToday: 0, turns: {}, refusal: null }
  assert.deepEqual(relayLines({ ...relay, setting: 'off', active: false }), ['Off. Remote picks run on local until Kiro Crew ships MC-10.'])
  assert.match(relayLines({ ...relay, ignored: true, active: false })[0], /MC-10.*ignored/)
  assert.deepEqual(relayLines(relay), ['No relay chat yet. Open it, then send any message.', '2 tasks wait for you.', 'Relay turns today: 0.'])
  const busy = relayLines({ ...relay, slot: 'dashboard:r', queued: 0, workers: 1, turnsToday: 4, refusal: { taskId: 'a.1', crew: 'box', code: 'crew_owner_unverifiable', at: '' } })
  assert.deepEqual(busy, ['Relay chat is open.', '1 relayed chat running.', 'Relay turns today: 4.', 'Last refusal: a.1 on box (crew_owner_unverifiable).'])
  assert.match(RELAY_CATCHES[0], /turn you sent/)
  assert.match(RELAY_CATCHES[1], /model turn/)
  assert.equal(RELAY_AGENT, 'avoozl-relay')
  const page = source('RoutingView.tsx')
  assert.match(page, /<RelayBlock /)
  assert.match(page, /routing\.remoteRelay/)
  assert.match(page, /stopgap until Kiro Crew ships MC-10/)
  assert.match(page, /openChat\(\{ message: RELAY_MESSAGE, agent: RELAY_AGENT, autoSend: true \}\)/)
  assert.match(page, /confirm=\{\{ title: 'Forget the relay chat\?'/)
  assert.match(source('routing-api.ts'), /saveRelay: [\s\S]*?'routing\.update', \{ where: 'workspace'/)
})

test('Settings > Delivery holds PR feedback and the writer model, with defaults as placeholders', () => {
  assert.deepEqual(toDeliverySection(toDeliveryForm({})), { delivery: {} })
  assert.deepEqual(toDeliverySection({ agent: '', model: 'model-a', prFeedback: 'off', feedbackRounds: '3' }), { delivery: { model: 'model-a', prFeedback: false, feedbackRounds: 3 } })
  assert.match(toDeliverySection({ agent: '', model: '', prFeedback: '', feedbackRounds: '21' }).error, /1–20/)
  const page = source('DeliverySettings.tsx')
  for (const raw of ['delivery.prFeedback', 'delivery.feedbackRounds', 'delivery.model', 'delivery.agent']) assert.ok(page.includes(raw), raw)
  assert.match(page, /placeholder=\{String\(DELIVERY_DEFAULTS\.feedbackRounds\)\}/)
  assert.match(page, /Open Routing/)
  assert.match(source('SettingsView.tsx'), /key: 'delivery', label: 'Delivery'/)
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

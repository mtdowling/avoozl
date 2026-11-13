// The Routing page (design §8.3, R42, R53.11) and Settings > Delivery
// (R53.3, R54.8): pure helpers and how the page wires them.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MC10_LINE,
  chatPlaceholder,
  crewMap,
  moveRule,
  readingText,
  ruleText,
  sessionNote,
  toCrewEntry,
  toCrewForm,
  toRule,
  toRuleForm,
  emptyRuleForm,
  withRules,
} from '../src/routing-api.ts'
import { toDeliveryForm, toDeliverySection } from '../src/delivery-api.ts'
import { sessionLabel } from '../src/views-api.ts'
import { attachHref } from '../src/task-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('rule rows read When <match> -> <route> on <crews> as <agent / model>', () => {
  assert.equal(
    ruleText({ id: 'windows-tests', when: { kinds: ['test'], paths: ['src/win/**'] }, on: 'any', requireTags: ['os:windows'] }),
    'When kind test, src/win/** -> local worker on any crew (os:windows)',
  )
  assert.equal(ruleText({ id: 'compliance', when: { labels: ['compliance'] }, keepLocal: true }), 'When label compliance -> local worker on local only')
  assert.equal(ruleText({ id: 'hard', when: { labels: ['hard'] }, session: { model: 'model-a' } }), 'When label hard -> local worker on local as model-a')
  assert.equal(ruleText({ id: 'routine', session: { choices: [{ model: 'b' }, { model: 'c' }] } }), 'Every task -> local worker on local as 2 choices')
  assert.match(sessionNote({ id: 'radar', route: 'github' }), /does not apply/)
  assert.equal(sessionNote({ id: 'x' }), null)
})

test('the rule form round-trips and refuses a crew pin outside this machine', () => {
  const rule = { id: 'spread', when: { roles: ['worker'] }, on: 'tags:os:linux', session: { choices: [{ model: 'b', weight: 2 }, { model: 'c' }] }, source: 'workspace' }
  assert.deepEqual(toRule(toRuleForm(rule)).rule, { id: 'spread', when: { roles: ['worker'] }, on: 'tags:os:linux', session: { choices: [{ model: 'b', weight: 2 }, { model: 'c' }] } })
  const pin = { ...emptyRuleForm(), id: 'pin', on: 'fake-linux' }
  assert.match(toRule(pin).error, /only when Save in is this machine/)
  assert.deepEqual(toRule({ ...pin, saveIn: 'machine' }).rule, { id: 'pin', on: 'fake-linux' })
  assert.match(toRule({ ...emptyRuleForm(), id: 'Bad Name' }).error, /Name is required/)
  assert.match(toRule({ ...emptyRuleForm(), id: 'w', choices: [{ agent: '', model: 'm', weight: '0' }] }).error, /weight is a whole number 1–100/)
})

test('reordering keeps a source whole and its pick and router', () => {
  const view = {
    rules: [
      { id: 'a', source: 'workspace' },
      { id: 'b', source: 'workspace' },
      { id: 'm', source: 'machine' },
    ],
    workspace: { rules: [{ id: 'a' }, { id: 'b' }], pick: { preset: 'spread-out' } },
    machine: { router: { enabled: true } },
    repositories: {},
  }
  assert.deepEqual(moveRule([{ id: 'a' }, { id: 'b' }], 1, 0).map((r) => r.id), ['b', 'a'])
  assert.deepEqual(withRules(view, 'workspace', [{ id: 'b' }, { id: 'a' }]), { rules: [{ id: 'b' }, { id: 'a' }], pick: { preset: 'spread-out' } })
  assert.deepEqual(withRules(view, 'machine', []), { router: { enabled: true } })
})

test('crew settings show defaults as placeholders and keep trust and hand-back', () => {
  const crew = { id: 'fake-linux', name: 'fake linux', tags: ['os:linux', 'trust:remote'], trust: 'remote', gitHosts: ['git.example.test'], chatLimit: 2, chatLimitSet: false, delivery: 'handback', sshHost: 'user@fake.example.test', worktreeRoot: '/w', configured: true, reading: null, ageSeconds: null, running: 0, available: false, why: 'no reading' }
  assert.equal(chatPlaceholder(crew), '2')
  assert.equal(chatPlaceholder({ id: 'local' }), '3')
  const form = toCrewForm(crew)
  assert.equal(form.chatLimit, '')
  assert.deepEqual(toCrewEntry('fake-linux', form).entry, { tags: ['os:linux', 'trust:remote'], gitHosts: ['git.example.test'], delivery: 'handback', sshHost: 'user@fake.example.test', worktreeRoot: '/w' })
  assert.match(toCrewEntry('fake-linux', { ...form, tags: 'color:red' }).error, /use key:value/)
  assert.match(toCrewEntry('fake-linux', { ...form, worktreeRoot: 'relative' }).error, /absolute/)
  assert.deepEqual(Object.keys(crewMap([crew, { ...crew, id: 'other', configured: false }])), ['fake-linux'])
  assert.equal(readingText({ ...crew, ageSeconds: 240, why: 'stale reading (240 s old)' }).health, 'stale 4m')
})

test('the Routing page has its five sections in order, the MC-10 line, and confirmed deletes', () => {
  const page = source('RoutingView.tsx')
  const order = ['title="Crews"', 'title="Rules"', 'title="Smart pick"', 'title="Model router"', 'title="Preview"'].map((s) => page.indexOf(s))
  assert.ok(order.every((at) => at > 0))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.match(MC10_LINE, /waits on Kiro Crew \(MC-10\)/)
  assert.match(page, /\{MC10_LINE\}/)
  assert.match(page, /Saved on this machine only\./)
  assert.match(page, /confirm=\{\{ title: `Delete rule/)
  assert.match(page, /confirm=\{\{ title: `Remove settings for/)
  assert.match(page, /placeholder=\{String\(DEFAULT_STALE_SECONDS\)\}/)
  assert.match(page, /draggable/)
  assert.match(page, /Session does not apply|sessionNote/)
  assert.match(source('App.tsx'), /key: 'routing', label: 'Routing'/)
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

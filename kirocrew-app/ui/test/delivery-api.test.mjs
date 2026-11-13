import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  LANES,
  LANE_MIN_WIDTH,
  deliveryLanes,
  drawnLane,
  canStartNow,
  filterLanes,
  laneBackground,
  laneForState,
  laneColumns,
  laneOf,
  progressGroups,
  resumeStatus,
} from '../src/delivery-api.ts'
import { filterActive, filterChoices, readFilter, writeFilter, NO_REPOSITORY } from '../src/filters.ts'

const task = (id, state, extra = {}) => ({
  id,
  title: id,
  epic: 'e1',
  kind: 'leaf',
  authority: 'local',
  route: 'local',
  completion: 'merged',
  repository: null,
  status: null,
  complete: state === 'done',
  ready: state === 'ready',
  state,
  decision: null,
  issue: null,
  ...extra,
})

const item = (id, extra = {}) => ({
  id,
  title: id,
  status: null,
  complete: false,
  repository: null,
  sessions: [],
  runs: [],
  evidence: [],
  integration: null,
  pullRequests: [],
  deliveries: [],
  worktrees: [],
  rounds: [],
  ...extra,
})

const session = (role, status, attempt = 1) => ({ slot: `${role}-${attempt}`, role, attempt, status, title: null, statusAt: null, boundAt: null })

test('each delivery lands in one lane by its state', () => {
  assert.equal(laneOf(task('a', 'ready'), null), 'ready')
  assert.equal(laneOf(task('a', 'waiting'), item('a', { sessions: [session('worker', 'working')] })), 'running')
  // A failed attempt with retries left retries on its own: still running.
  assert.equal(laneOf(null, item('a', { deliveries: [{ state: 'failed' }] })), 'running')
  assert.equal(laneOf(null, item('a', { sessions: [session('worker', 'closed'), session('security', 'working')] })), 'reviewing')
  assert.equal(laneOf(null, item('a', { deliveries: [{ state: 'verified' }] })), 'reviewing')
  assert.equal(laneOf(null, item('a', { deliveries: [{ state: 'decision' }] })), 'needs-you')
  assert.equal(laneOf(task('a', 'needs-you'), item('a')), 'needs-you')
  assert.equal(laneOf(null, item('a', { complete: true })), 'done')
  assert.equal(laneOf(task('a', 'deferred'), null), 'waiting')
})

test('lanes hold delivery records and ready leaves, newest done first', () => {
  const graph = {
    revision: 3,
    epics: [{ id: 'e1', title: 'Epic one', count: 4 }],
    statuses: [
      { id: 'deferred', label: 'Deferred', complete: false },
      { id: 'planned', label: 'Planned', complete: false },
      { id: 'done', label: 'Done', complete: true },
    ],
    repositories: [],
    total: 4,
    tasks: [task('r', 'ready'), task('w', 'running'), task('old', 'done'), task('new', 'done'), task('epic', 'ready', { kind: 'epic' })],
    edges: [],
  }
  const lanes = deliveryLanes(graph, [
    item('w', { sessions: [session('worker', 'working', 1), session('worker', 'working', 2)], rounds: [{ commit: 'c', current: true, verdicts: [] }] }),
    item('old', { complete: true, integration: { commit: 'a', branch: 'main', at: '2026-11-10T00:00:00Z' } }),
    item('new', { complete: true, integration: { commit: 'b', branch: 'main', at: '2026-11-12T00:00:00Z' } }),
    item('gone', { status: 'superseded' }),
  ])
  assert.deepEqual(lanes.ready.map((c) => c.id), ['r'])
  assert.deepEqual(lanes.running.map((c) => [c.id, c.attempt, c.reviewRounds, c.epic]), [['w', 2, 1, 'Epic one']])
  assert.deepEqual(lanes.done.map((c) => c.id), ['new', 'old'])
  assert.equal(Object.values(lanes).flat().some((c) => c.id === 'gone' || c.id === 'epic'), false)
  assert.equal(resumeStatus(graph), 'planned')
  assert.equal(resumeStatus({ ...graph, statuses: graph.statuses.filter((s) => s.id !== 'planned') }), null)
})

test('the Delivery tab draws four lanes, In progress holding running and reviewing, none yellow', () => {
  assert.deepEqual(LANES.map((l) => l.id), ['ready', 'in-progress', 'needs-you', 'waiting'])
  for (const lane of LANES) {
    assert.match(lane.tint, /^var\(--/)
    assert.doesNotMatch(lane.tint, /--warn/)
    assert.match(laneBackground(lane.tint), /^color-mix\(in srgb, var\(--.*\) 8%, var\(--card/)
  }
})

const card = (id, extra = {}) => ({
  id,
  title: `Task ${id}`,
  epic: null,
  epicId: null,
  repository: null,
  planId: null,
  spec: null,
  state: 'waiting',
  wave: 1,
  decision: null,
  authority: 'local',
  route: 'local',
  issue: null,
  item: null,
  attempt: null,
  sessions: [],
  reviewRounds: 0,
  deliveryState: null,
  deferred: false,
  at: null,
  ...extra,
})
const board = () => ({
  ready: [card('r1', { planId: 'p1', epicId: 'e1', epic: 'e1', repository: 'app', state: 'ready', wave: 1 })],
  running: [card('w1', { planId: 'p1', repository: 'app', state: 'running', wave: 2 }), card('w2', { spec: 'p2', state: 'running', wave: 2 })],
  reviewing: [card('v1', { spec: 'p2', title: 'Review the parser', state: 'running', wave: 3 })],
  'needs-you': [card('n1', { planId: 'p1', deliveryState: 'decision', state: 'needs-you' })],
  waiting: [card('x1', { repository: 'lib', authority: 'github', wave: 4 })],
  done: [],
})

test('In progress groups running then reviewing, and leaves out an empty group', () => {
  const lanes = board()
  assert.deepEqual(drawnLane(lanes, 'in-progress').map((c) => c.id), ['w1', 'w2', 'v1'])
  assert.deepEqual(
    progressGroups(lanes).map((g) => [g.id, g.label, g.cards.length]),
    [
      ['running', 'Running', 2],
      ['reviewing', 'Reviewing', 1],
    ],
  )
  assert.deepEqual(progressGroups({ ...lanes, reviewing: [] }).map((g) => g.id), ['running'])
})

test('the shared filter applies across lanes, and lane counts are the filtered counts', () => {
  const lanes = board()
  const count = (filtered, lane) => drawnLane(filtered, lane).length
  const ids = (filter) => Object.values(filterLanes(lanes, filter)).flat().map((c) => c.id)
  const byPlan = filterLanes(lanes, { plan: 'plan:p1' })
  assert.deepEqual([count(byPlan, 'ready'), count(byPlan, 'in-progress'), count(byPlan, 'needs-you'), count(byPlan, 'waiting')], [1, 1, 1, 0])
  assert.deepEqual(ids({ plan: 'spec:p2' }), ['w2', 'v1'])
  assert.deepEqual(drawnLane(filterLanes(lanes, { q: 'parser' }), 'in-progress').map((c) => c.id), ['v1'])
  assert.deepEqual(drawnLane(filterLanes(lanes, { q: 'W2' }), 'in-progress').map((c) => c.id), ['w2'])
  assert.deepEqual(ids({ repository: 'lib' }), ['x1'])
  assert.deepEqual(ids({ repository: NO_REPOSITORY }), ['w2', 'v1', 'n1'])
  assert.deepEqual(ids({ epic: 'e1' }), ['r1'])
  assert.deepEqual(ids({ state: 'running' }), ['w1', 'w2', 'v1'])
  assert.deepEqual(ids({ needsYou: true }), ['n1'])
  assert.deepEqual(ids({ waveMin: 2, waveMax: 3 }), ['w1', 'w2', 'v1'])
  assert.deepEqual(ids({ authority: 'github' }), ['x1'])
  // Filters combine; clearing them shows everything again.
  assert.deepEqual(ids({ plan: 'spec:p2', state: 'running', q: 'review' }), ['v1'])
  assert.equal(ids({}).length, 6)
  assert.equal(filterActive({}), false)
  assert.equal(filterActive({ q: '  ' }), false)
  assert.equal(filterActive({ needsYou: true }), true)
  assert.equal(laneForState('running'), 'in-progress')
  assert.equal(laneForState('deferred'), 'waiting')
  assert.equal(laneForState('done'), 'done')
})

// Root cause of the empty Plan and Repository dropdowns: they listed the
// plan IDs and repositories stored on tasks. Spec tasks carry no plan ID
// (membership is their spec folder) and Nupp's tasks name no repository.
test('Plan and Repository choices come from spec folders and the registered repositories', () => {
  const task = (id, extra) => ({ id, title: id, epic: null, kind: 'leaf', authority: 'local', route: 'local', completion: 'merged', repository: null, status: null, complete: false, ready: false, state: 'waiting', decision: null, issue: null, planId: null, ...extra })
  const graph = {
    revision: 1,
    epics: [],
    statuses: [],
    repositories: ['nupp', 'tecs'],
    total: 3,
    tasks: [task('a', { spec: 'compression' }), task('b', { spec: 'ci' }), task('c', { planId: 'old-plan' })],
    edges: [],
  }
  const choices = filterChoices(graph)
  assert.deepEqual(choices.plans.map((o) => o.value), ['spec:ci', 'spec:compression', 'plan:old-plan'])
  assert.deepEqual(choices.repositories.map((o) => o.value), ['nupp', 'tecs', NO_REPOSITORY])
  assert.ok(choices.plans.length > 0 && choices.repositories.length > 0)
})

test('the filter is remembered per workspace, shared by Graph and Delivery, and bad values are dropped', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  writeFilter(storage, 'a', { q: 'x', state: 'ready', needsYou: true, waveMin: 2 })
  assert.deepEqual(readFilter(storage, 'a'), { q: 'x', state: 'ready', needsYou: true, waveMin: 2 })
  assert.deepEqual(readFilter(storage, 'b'), {})
  store.set('avoozl.filters.c', JSON.stringify({ state: 'nonsense', plan: 3, needsYou: 'yes', waveMin: -1 }))
  assert.deepEqual(readFilter(storage, 'c'), {})
  store.set('avoozl.filters.d', '{not json')
  assert.deepEqual(readFilter(storage, 'd'), {})
})

test('Start now is offered only on local-route cards Avoozl codes itself', () => {
  assert.equal(canStartNow(card('a')), true)
  assert.equal(canStartNow(card('b', { route: 'github' })), false)
  assert.equal(canStartNow(card('c', { deferred: true })), false)
})

test('lanes wrap 4, 2, 1 per row and never go under their minimum width', () => {
  const at = (n, gap = 16) => n * LANE_MIN_WIDTH + (n - 1) * gap
  assert.equal(laneColumns(at(4), 4), 4)
  assert.equal(laneColumns(at(4) - 1, 4), 2)
  assert.equal(laneColumns(at(3), 4), 2)
  assert.equal(laneColumns(at(2) - 1, 4), 1)
  assert.equal(laneColumns(200, 4), 1)
  // One lane shown (a state filter) takes the whole row.
  assert.equal(laneColumns(at(4), 1), 1)
})

test('the state icons are labelled, theme-colored, and still under reduced motion', () => {
  const view = readFileSync(new URL('../src/DeliveryView.tsx', import.meta.url), 'utf8')
  const icon = view.slice(view.indexOf('export function StateIcon'), view.indexOf('const LANE_GAP'))
  assert.match(icon, /useMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  // Each animation is drawn only when motion is allowed.
  assert.equal((icon.match(/\{!still && \(\s*<animateTransform/g) ?? []).length, 2)
  assert.match(icon, /aria-label=\{label\}/)
  assert.match(icon, /<title>\{label\}<\/title>/)
  assert.doesNotMatch(icon, /--warn|#[0-9a-f]{3,6}\b/i)
  // In progress cards carry their group's icon.
  assert.match(view, /\{props\.phase && <StateIcon phase=\{props\.phase\} \/>\}/)
  assert.match(view, /list\(`\$\{lane\.id\}:\$\{group\.id\}`, group\.cards, group\.id\)/)
})

test('the lane rule is the one the Avoozl state Project field uses', async () => {
  const shared = await import('../../../src/delivery-lanes.mjs')
  assert.equal(laneOf, shared.laneOf)
  assert.equal(shared.avoozlState({ state: 'deferred' }, null), 'deferred')
  assert.equal(shared.laneOf({ state: 'deferred' }, null), 'waiting')
})

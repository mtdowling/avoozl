import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  LANES,
  LANE_LABEL_WIDTH,
  LANE_MIN_WIDTH,
  deliveryLanes,
  drawnLane,
  canStartNow,
  filterLanes,
  laneForState,
  laneColumns,
  laneWidth,
  laneOf,
  loadLabel,
  machineLoads,
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
  assert.deepEqual(
    lanes.ready.map((c) => c.id),
    ['r'],
  )
  assert.deepEqual(
    lanes.running.map((c) => [c.id, c.attempt, c.reviewRounds, c.epic]),
    [['w', 2, 1, 'Epic one']],
  )
  assert.deepEqual(
    lanes.done.map((c) => c.id),
    ['new', 'old'],
  )
  assert.equal(
    Object.values(lanes)
      .flat()
      .some((c) => c.id === 'gone' || c.id === 'epic'),
    false,
  )
  assert.equal(resumeStatus(graph), 'planned')
  assert.equal(resumeStatus({ ...graph, statuses: graph.statuses.filter((s) => s.id !== 'planned') }), null)
})

test('the Delivery tab draws four lanes, In progress holding running and reviewing, none yellow', () => {
  assert.deepEqual(
    LANES.map((l) => l.id),
    ['ready', 'in-progress', 'needs-you', 'waiting'],
  )
  for (const lane of LANES) {
    assert.match(lane.tint, /^var\(--/)
    assert.doesNotMatch(lane.tint, /--warn/)
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
  assert.deepEqual(
    drawnLane(lanes, 'in-progress').map((c) => c.id),
    ['w1', 'w2', 'v1'],
  )
  assert.deepEqual(
    progressGroups(lanes).map((g) => [g.id, g.label, g.cards.length]),
    [
      ['running', 'Running', 2],
      ['reviewing', 'Reviewing', 1],
    ],
  )
  assert.deepEqual(
    progressGroups({ ...lanes, reviewing: [] }).map((g) => g.id),
    ['running'],
  )
})

test('the shared filter applies across lanes, and lane counts are the filtered counts', () => {
  const lanes = board()
  const count = (filtered, lane) => drawnLane(filtered, lane).length
  const ids = (filter) =>
    Object.values(filterLanes(lanes, filter))
      .flat()
      .map((c) => c.id)
  const byPlan = filterLanes(lanes, { plan: 'plan:p1' })
  assert.deepEqual([count(byPlan, 'ready'), count(byPlan, 'in-progress'), count(byPlan, 'needs-you'), count(byPlan, 'waiting')], [1, 1, 1, 0])
  assert.deepEqual(ids({ plan: 'spec:p2' }), ['w2', 'v1'])
  assert.deepEqual(
    drawnLane(filterLanes(lanes, { q: 'parser' }), 'in-progress').map((c) => c.id),
    ['v1'],
  )
  assert.deepEqual(
    drawnLane(filterLanes(lanes, { q: 'W2' }), 'in-progress').map((c) => c.id),
    ['w2'],
  )
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
  const task = (id, extra) => ({
    id,
    title: id,
    epic: null,
    kind: 'leaf',
    authority: 'local',
    route: 'local',
    completion: 'merged',
    repository: null,
    status: null,
    complete: false,
    ready: false,
    state: 'waiting',
    decision: null,
    issue: null,
    planId: null,
    ...extra,
  })
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
  assert.deepEqual(
    choices.plans.map((o) => o.value),
    ['spec:ci', 'spec:compression', 'plan:old-plan'],
  )
  assert.deepEqual(
    choices.repositories.map((o) => o.value),
    ['nupp', 'tecs', NO_REPOSITORY],
  )
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

test('all four lanes share one row above phone width; a phone stacks them', () => {
  const at = (n, gap = 16) => n * LANE_MIN_WIDTH + (n - 1) * gap
  // The narrowest board above phone width: a 768 px window beside the left
  // nav, in the full app shell with the host's stylesheet (measured).
  const smallest = 408
  assert.ok(at(4) <= smallest, `four lanes fit a ${smallest} px board`)
  for (const width of [smallest, 728, 984, 1144]) assert.equal(laneColumns(width, 4), 4, `${width} px`)
  // A phone: 1 per row whatever the width.
  assert.equal(laneColumns(at(4), 4, 16, true), 1)
  // Too narrow even for the minimum: 2, then 1, never sideways scroll.
  assert.equal(laneColumns(at(4) - 1, 4), 2)
  assert.equal(laneColumns(at(2) - 1, 4), 1)
  // One lane shown (a state filter) takes the whole row.
  assert.equal(laneColumns(at(4), 1), 1)
  // Narrow lanes draw icon-only buttons; wide ones keep their words.
  assert.ok(laneWidth(smallest, 4) < LANE_LABEL_WIDTH)
  assert.ok(laneWidth(984, 4) >= LANE_LABEL_WIDTH)
})

test('the lane rule is the shared one', async () => {
  const shared = await import('../../../src/delivery-lanes.mjs')
  assert.equal(laneOf, shared.laneOf)
  assert.equal(shared.laneOf({ state: 'deferred' }, null), 'waiting')
})
test('the state icons are labelled, theme-colored, and still under reduced motion', () => {
  const view = readFileSync(new URL('../src/DeliveryView.tsx', import.meta.url), 'utf8')
  const icon = view.slice(view.indexOf('export function StateIcon'), view.indexOf('const LANE_GAP'))
  assert.match(icon, /useMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  // Each animation is drawn only when motion is allowed.
  assert.equal((icon.match(/\{!still && \(?\s*<animateTransform/g) ?? []).length, 2)
  assert.match(icon, /aria-label=\{label\}/)
  assert.match(icon, /<title>\{label\}<\/title>/)
  assert.doesNotMatch(icon, /--warn|#[0-9a-f]{3,6}\b/i)
  // In progress cards carry their group's icon.
  assert.match(view, /\{props\.phase && <StateIcon phase=\{props\.phase\} \/>\}/)
  assert.match(view, /list\(`\$\{lane\.id\}:\$\{group\.id\}`, group\.cards, group\.id\)/)
})

// Task 41.6: Delivery is a Dashboards page again, with its filters in the
// left nav as rail rows and chips, no native dropdown.
test('Delivery is a Dashboards page with nav rail filters', async () => {
  const { DASHBOARD_PAGES } = await import('../src/nav-api.ts')
  assert.ok(DASHBOARD_PAGES.some((page) => page.key === 'delivery'))
  const view = readFileSync(new URL('../src/DeliveryView.tsx', import.meta.url), 'utf8')
  assert.match(view, /<NavSlotFor section="dashboard">/)
  assert.match(view, /<RailChips\s+id="epics"/)
  assert.doesNotMatch(view, /<select|FilterBar id=|Radar|driver/i)
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /tab === 'delivery' \? \(\s*<DeliveryView workspaceId=\{active\} \/>/)
  assert.match(app, /t\.key === 'dashboard'/)
})

test('chip counts keep only values a card has, in the choices order', async () => {
  const { chipCounts } = await import('../src/delivery-api.ts')
  const cards = [{ epicId: 'b' }, { epicId: 'b' }, { epicId: null }]
  assert.deepEqual(
    chipCounts(
      [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: '(none)', label: 'No epic' },
      ],
      cards,
      (card) => card.epicId ?? '(none)',
    ),
    [
      { value: 'b', label: 'B', count: 2 },
      { value: '(none)', label: 'No epic', count: 1 },
    ],
  )
})

test('each machine counts its running chats against its lane limit; a card names its host', () => {
  const live = (id, n) => item(id, { sessions: Array.from({ length: n }, (_, i) => session('worker', 'working', i + 1)) })
  const items = [live('a', 2), live('b', 1), item('c', { sessions: [session('worker', 'closed')] })]
  const worker = (host, taskId, n) => ({
    host,
    crewId: 'c',
    taskId,
    state: 'running',
    chatKey: `${host}-${taskId}-${n}`,
    status: 'working',
    updatedAt: '',
    attachUrl: null,
    stale: false,
    lastOkAt: null,
  })
  const workers = [worker('dev desktop', 'd', 1), worker('dev desktop', 'e', 1), worker('build box', 'f', 1)]
  const { loads, hostsOf } = machineLoads(items, workers, 3)
  // Expected: live local sessions are 3 (the closed one is not running).
  const localRunning = items.flatMap((i) => i.sessions).filter((s) => s.status !== 'closed').length
  assert.deepEqual(
    loads.map((l) => [l.host, l.running, l.limit]),
    [
      ['This Mac', localRunning, 3],
      ['build box', workers.filter((w) => w.host === 'build box').length, null],
      ['dev desktop', workers.filter((w) => w.host === 'dev desktop').length, null],
    ],
  )
  assert.equal(loads.map(loadLabel).join(' · '), `This Mac ${localRunning}/3 · build box 1 · dev desktop 2`)
  assert.deepEqual(hostsOf.get('d'), ['dev desktop'])
  assert.deepEqual(hostsOf.get('a'), ['This Mac'])
  assert.equal(hostsOf.get('c'), undefined)
  // No limit known: the count alone. This Mac with nothing running and a limit still shows.
  assert.equal(machineLoads([], [], null).loads.length, 0)
  assert.equal(loadLabel(machineLoads([], [], 3).loads[0]), 'This Mac 0/3')
})

test('an In progress card shows its machine badge and the lane shows the counts line', () => {
  const view = readFileSync(new URL('../src/DeliveryView.tsx', import.meta.url), 'utf8')
  assert.match(view, /props\.phase && \(\s*<span data-machine-badge>\s*<Badge small>\{props\.machines\.join\(', '\)\}<\/Badge>/)
  assert.match(view, /data-machine-counts>\s*\{props\.machines\.map\(loadLabel\)\.join\(' · '\)\}/)
  // Theme variables only.
  assert.doesNotMatch(view.slice(view.indexOf('data-machine-counts') - 80, view.indexOf('data-machine-counts') + 200), /#[0-9a-f]{3,6}\b/i)
})

test('a live planner batch is one In progress card with its tasks and reason; a split one is not folded', () => {
  const run = { id: 'batch:g:a+b+c', group: 'g', tasks: ['a', 'b', 'c'], leader: 'a', reason: 'Tiny edits', state: 'running' }
  const graph = {
    revision: 1,
    epics: [],
    statuses: [],
    repositories: [],
    total: 4,
    edges: [],
    tasks: ['a', 'b', 'c', 'd'].map((id) => task(id, 'running', { title: `Task ${id}` })),
  }
  const running = (id, extra = {}) =>
    item(id, { title: `Task ${id}`, status: 'running', sessions: id === 'a' ? [session('worker', 'coding')] : [], deliveries: [{ state: 'running' }], ...extra })
  const lanes = deliveryLanes(graph, [
    running('a', { batchGroup: run }),
    running('b', { batchGroup: run }),
    running('c', { batchGroup: run }),
    running('d', { alone: 'e waits on d', batchGroup: { ...run, id: null, tasks: ['d', 'e'], leader: 'd', state: null } }),
  ])
  assert.deepEqual(lanes.running.map((card) => card.id).sort(), ['a', 'd'])
  const card = lanes.running.find((c) => c.id === 'a')
  assert.deepEqual(card.batch, {
    id: run.id,
    reason: 'Tiny edits',
    members: [
      { id: 'a', title: 'Task a' },
      { id: 'b', title: 'Task b' },
      { id: 'c', title: 'Task c' },
    ],
  })
  assert.equal(lanes.running.find((c) => c.id === 'd').alone, 'e waits on d')
  const split = deliveryLanes(
    graph,
    ['a', 'b'].map((id) => running(id, { batchGroup: { ...run, state: 'split' } })),
  )
  assert.deepEqual(split.running.map((c) => [c.id, c.batch]).sort(), [
    ['a', null],
    ['b', null],
  ])
})

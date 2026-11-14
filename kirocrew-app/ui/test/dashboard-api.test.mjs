import assert from 'node:assert/strict'
import test from 'node:test'
import { SMALL, countsLayout, countsStyles, summarize } from '../src/dashboard-api.ts'

const task = (id, state, extra = {}) => ({
  id,
  title: id.toUpperCase(),
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

const edge = (from, to) => ({ from, to, kind: 'requires', condition: null, blocking: true, satisfied: false })

const delivery = (id, extra = {}) => ({
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
  ...extra,
})

test('the dashboard puts what needs the owner first and orders ready work by wave', () => {
  const graph = {
    revision: 1,
    epics: [{ id: 'e1', title: 'Epic one', count: 4 }],
    statuses: [],
    repositories: [],
    total: 5,
    tasks: [
      task('a', 'done'),
      task('b', 'ready'),
      task('c', 'ready'),
      task('d', 'needs-you'),
      task('epic', 'waiting', { kind: 'epic' }),
    ],
    edges: [edge('a', 'c'), edge('c', 'b')],
  }
  const summary = summarize({
    graph,
    delivery: [
      delivery('d', { deliveries: [{ state: 'decision' }] }),
      delivery('r', { sessions: [{ slot: 's1', role: 'worker', attempt: 1, status: 'working', link: '/chat/s1' }] }),
      delivery('gone', { sessions: [{ slot: 's2', role: 'worker', attempt: 1, status: 'closed' }] }),
      delivery('a', { complete: true, integration: { commit: 'x', branch: 'main', at: '2026-11-12T10:00:00Z' } }),
    ],
    conflicts: [
      { kind: 'needs-human', taskId: 'z', title: 'Z', detail: 'Task needs review.' },
      { kind: 'decision', taskId: 'd', title: 'D', detail: 'held' },
    ],
    plans: { total: 2, items: [{ id: 'p', state: 'approved' }, { id: 'q', state: 'draft' }] },
  })
  assert.deepEqual(
    summary.attention.map((a) => [a.kind, a.taskId, a.tab]),
    [
      ['delivery', 'd', 'delivery'],
      ['decision', 'd', 'conflicts'],
      ['needs-human', 'z', 'conflicts'],
    ],
  )
  // Epics are not counted; only leaves are.
  assert.deepEqual(summary.counts, { ready: 2, running: 0, waiting: 0, 'needs-you': 1, done: 1, deferred: 0 })
  assert.deepEqual(summary.running.map((r) => r.id), ['r'])
  assert.deepEqual(summary.readyNext.map((t) => [t.id, t.wave]), [['c', 2], ['b', 3]])
  assert.deepEqual(summary.progress, [{ epic: 'e1', title: 'Epic one', done: 1, total: 4, running: 0 }])
  assert.deepEqual(summary.plans, { approved: 1, draft: 1, total: 2 })
})

test('a failed read leaves only its own section empty', () => {
  const summary = summarize({ graph: null, delivery: null, conflicts: [], plans: null })
  assert.equal(summary.readyNext.length, 0)
  assert.equal(summary.attention.length, 0)
  assert.equal(summary.plans.total, 0)
})

test('In flight has one row per live agent chat, by role, newest activity first', () => {
  const graph = {
    revision: 1,
    epics: [{ id: 'e1', title: 'Epic one', count: 2 }],
    statuses: [],
    repositories: [],
    total: 2,
    tasks: [task('w', 'running'), task('p', 'running', { epic: null })],
    edges: [],
  }
  const session = (slot, role, attempt, statusAt, extra = {}) => ({
    slot,
    role,
    attempt,
    status: 'working',
    title: null,
    statusAt,
    boundAt: '2026-11-12T09:00:00Z',
    model: 'claude-opus-5.5',
    link: `/chat?sid=${slot}`,
    ...extra,
  })
  const summary = summarize({
    graph,
    delivery: [
      delivery('w', {
        title: 'Write it',
        sessions: [
          session('w1', 'worker', 1, '2026-11-12T10:00:00Z', { status: 'closed' }),
          session('w2', 'worker', 2, '2026-11-12T11:00:00Z'),
          session('r1', 'security', 2, '2026-11-12T11:30:00Z', { title: 'Security review: auth paths' }),
          session('c1', 'checks', 2, '2026-11-12T11:10:00Z'),
        ],
      }),
      delivery('p', { title: 'Plan it', sessions: [session('pl', 'planner', 1, '2026-11-12T11:20:00Z')] }),
    ],
    conflicts: [],
    plans: null,
  })
  assert.deepEqual(
    summary.inFlight.map((row) => [row.slot, row.role, row.taskId, row.epic, row.attempt, row.focus]),
    [
      ['r1', 'security', 'w', 'Epic one', 2, 'Security review: auth paths'],
      ['pl', 'planner', 'p', null, 1, null],
      ['c1', 'checks', 'w', 'Epic one', 2, null],
      ['w2', 'worker', 'w', 'Epic one', 2, null],
    ],
  )
  assert.equal(summary.inFlight[0].session.link, '/chat?sid=r1')
  assert.equal(summary.inFlight[0].model, 'claude-opus-5.5')
})

test('Up next follows the tick dispatch order, and epics count their running chats', () => {
  const leaf = (id, extra) => ({ id, title: id, epic: 'e1', kind: 'leaf', authority: 'local', route: 'local', completion: 'merged', repository: null, status: null, complete: false, ready: true, state: 'ready', decision: null, issue: null, ...extra })
  const graph = {
    revision: 1,
    epics: [{ id: 'e1', title: 'Epic one', count: 3 }],
    statuses: [],
    repositories: [],
    total: 3,
    tasks: [leaf('x', { order: 2 }), leaf('y', { order: 0 }), leaf('z', { order: 1, state: 'running', ready: false })],
    edges: [],
  }
  const session = (slot, role) => ({ slot, role, attempt: 1, title: null, status: 'working', statusAt: null, boundAt: null })
  const item = (id, sessions) => ({ id, title: id, status: null, complete: false, repository: null, sessions, runs: [], evidence: [], integration: null, pullRequests: [], deliveries: [], worktrees: [] })
  const summary = summarize({ graph, delivery: [item('z', [session('a', 'worker'), session('b', 'checks')])], conflicts: [], plans: null })
  assert.deepEqual(summary.readyNext.map((t) => t.id), ['y', 'x'])
  assert.equal(summary.progress[0].running, 2)
})

test('a review group is one Needs you row that carries its tasks', () => {
  const group = { kind: 'review', id: 'review:spec:p', taskId: null, title: 'Review 70 tasks in p: their design text changed', detail: 'd', tasks: [] }
  const summary = summarize({ graph: null, delivery: null, conflicts: [group, { ...group, id: 'review:spec:q' }], plans: null })
  assert.deepEqual(
    summary.attention.map((a) => [a.kind, a.taskId, a.group?.id]),
    [
      ['review', null, 'review:spec:p'],
      ['review', null, 'review:spec:q'],
    ],
  )
})

test('the state buttons share the title line wide, wrap right medium, and grid small', () => {
  assert.equal(SMALL, '(max-width: 480px)')
  assert.equal(countsLayout(true, false), 'wide')
  assert.equal(countsLayout(false, false), 'medium')
  assert.equal(countsLayout(false, true), 'small')

  const wide = countsStyles('wide')
  assert.equal(wide.list.flexWrap, 'wrap')
  assert.equal(wide.list.marginLeft, 'auto')
  assert.equal(wide.list.width, undefined)

  // Medium: a full-width line of its own, right-aligned, wrapping with even gaps.
  const medium = countsStyles('medium')
  assert.equal(medium.list.width, '100%')
  assert.equal(medium.list.justifyContent, 'flex-end')
  assert.equal(medium.list.flexWrap, 'wrap')
  assert.equal(medium.list.gap, wide.list.gap)

  // Small: two even columns that can shrink, 32 px tap targets, full width.
  const small = countsStyles('small')
  assert.equal(small.list.display, 'grid')
  assert.equal(small.list.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))')
  assert.equal(small.list.width, '100%')
  assert.ok(small.button.minHeight >= 32)
  assert.equal(small.button.width, '100%')
})

test('neverRan is true only when the delivery read worked and nothing has ever run', () => {
  const base = { graph: null, conflicts: [], plans: null }
  assert.equal(summarize({ ...base, delivery: [] }).neverRan, true)
  assert.equal(summarize({ ...base, delivery: [delivery('a')] }).neverRan, true, 'a planned task has not run')
  assert.equal(summarize({ ...base, delivery: null }).neverRan, false, 'an unread list is not never-run')
  assert.equal(summarize({ ...base, delivery: [delivery('a', { complete: true })] }).neverRan, false)
  assert.equal(summarize({ ...base, delivery: [delivery('a', { integration: { commit: 'c', branch: 'main', at: null } })] }).neverRan, false)
})

test('Issue Radar claims from GitHub are listed beside Avoozl chats, with what GitHub cannot show', () => {
  const claim = {
    repository: 'mtdowling/avoozl-radar-test',
    number: 17,
    title: 'Support greet with an array',
    url: 'https://github.com/mtdowling/avoozl-radar-test/issues/17',
    crewId: 'c_0badc0de',
    crewName: 'Bode',
    phase: 'implementing',
    pr: 6,
    prUrl: 'https://github.com/mtdowling/avoozl-radar-test/pull/6',
    updated: '2026-11-10T02:10:00Z',
    commentUrl: null,
    stale: true,
    noMarker: false,
  }
  const radar = { readAt: '2026-11-14T06:00:00Z', stale: 1, rows: [claim], errors: [], unseen: ['paused', 'machine', 'chat'] }
  const summary = summarize({ graph: null, delivery: null, conflicts: [], plans: null, radar })
  assert.deepEqual(summary.radarFlight, [claim])
  assert.deepEqual(summary.radarUnseen, ['paused', 'machine', 'chat'])
  // An older backend, or a failed read, shows none.
  assert.deepEqual(summarize({ graph: null, delivery: null, conflicts: [], plans: null }).radarFlight, [])
})
